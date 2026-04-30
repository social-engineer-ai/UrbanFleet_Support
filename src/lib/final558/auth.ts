// Auth gate + lockout helpers for the BADM 558 final.
//
// Two-factor model: students log in with their existing UIUC SSO (handled
// by NextAuth via lib/auth.ts), then enter the cohort password to unlock
// the final. The cookie issued here is separate from the NextAuth session
// cookie so we can keep the second factor short-lived (90 min) without
// affecting other parts of the app.

import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "../prisma";

const COOKIE_NAME = "final_558_auth";
const COOKIE_LIFETIME_MS = 90 * 60 * 1000; // 90 minutes
const MAX_FAILURES = 5;
const LOCKOUT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const LOCKOUT_DURATION_MS = 60 * 60 * 1000; // 1 hour

// Matches the value stored in User.course on existing accounts (just the
// number, no "BADM " prefix). Same string is used as the unique key on
// Final558Settings.course so one cohort row gates one course label.
const FINAL_558_COURSE = "558";

// === Cookie ============================================================
// We sign with HMAC-SHA256. The secret comes from FINAL_558_COOKIE_SECRET;
// if not set we fall back to NEXTAUTH_SECRET so deployments don't need a
// new env var to ship.

interface CookiePayload {
  userId: string;
  issuedAt: number;
}

function getSecret(): string {
  const secret =
    process.env.FINAL_558_COOKIE_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "FINAL_558_COOKIE_SECRET or NEXTAUTH_SECRET must be set to issue final-558 cookies"
    );
  }
  return secret;
}

async function hmac(payload: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Buffer.from(new Uint8Array(sig)).toString("base64url");
}

function b64encode(s: string): string {
  return Buffer.from(s, "utf-8").toString("base64url");
}

function b64decode(s: string): string {
  return Buffer.from(s, "base64url").toString("utf-8");
}

export async function issueFinalAuthCookie(userId: string): Promise<void> {
  const payload: CookiePayload = { userId, issuedAt: Date.now() };
  const body = b64encode(JSON.stringify(payload));
  const sig = await hmac(body, getSecret());
  const value = `${body}.${sig}`;
  const jar = await cookies();
  jar.set(COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_LIFETIME_MS / 1000,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearFinalAuthCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export async function readFinalAuthCookie(): Promise<CookiePayload | null> {
  const jar = await cookies();
  const value = jar.get(COOKIE_NAME)?.value;
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot < 0) return null;
  const body = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = await hmac(body, getSecret());
  if (sig !== expected) return null;
  try {
    const parsed = JSON.parse(b64decode(body)) as CookiePayload;
    if (Date.now() - parsed.issuedAt > COOKIE_LIFETIME_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

// === Lockout / attempt tracking ========================================

export interface LockoutStatus {
  locked: boolean;
  unlockAt: Date | null;
  failuresInWindow: number; // failures since most recent success or window start
  remaining: number; // attempts remaining before lockout
}

export async function getLockoutStatus(userId: string): Promise<LockoutStatus> {
  const windowStart = new Date(Date.now() - LOCKOUT_WINDOW_MS);
  const recent = await prisma.final558Attempt.findMany({
    where: { userId, attemptedAt: { gte: windowStart } },
    orderBy: { attemptedAt: "desc" },
  });

  // Count failures since the most recent success.
  let failures = 0;
  for (const a of recent) {
    if (a.succeeded) break;
    failures += 1;
  }

  if (failures >= MAX_FAILURES) {
    // Find the 5th-most-recent failure; lockout ends 1 hour after it.
    // (`recent` is already ordered desc.)
    const failureRows = recent.filter((a) => !a.succeeded).slice(0, MAX_FAILURES);
    const fifthFailure = failureRows[MAX_FAILURES - 1];
    const unlockAt = new Date(
      fifthFailure.attemptedAt.getTime() + LOCKOUT_DURATION_MS
    );
    if (unlockAt.getTime() > Date.now()) {
      return { locked: true, unlockAt, failuresInWindow: failures, remaining: 0 };
    }
  }

  return {
    locked: false,
    unlockAt: null,
    failuresInWindow: failures,
    remaining: Math.max(0, MAX_FAILURES - failures),
  };
}

export async function recordAttempt(
  userId: string,
  succeeded: boolean
): Promise<void> {
  await prisma.final558Attempt.create({
    data: { userId, succeeded },
  });
}

// === Settings + password verification ==================================

export interface FinalEntryStatus {
  ok: boolean;
  error?: "wrong_course" | "no_window" | "outside_window" | "already_attempted" | "locked" | "no_settings" | "no_user";
  errorMeta?: {
    windowStart?: Date;
    windowEnd?: Date;
    completedAt?: Date;
    unlockAt?: Date;
  };
}

export async function getFinal558Settings() {
  return prisma.final558Settings.findUnique({
    where: { course: FINAL_558_COURSE },
  });
}

// Check whether this user is allowed to see the password gate / pre-session
// screen at all. Does NOT consume the cookie; that's a separate step.
export async function checkFinalEntryPreconditions(
  userId: string
): Promise<FinalEntryStatus> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, error: "no_user" };
  if (user.course !== FINAL_558_COURSE) {
    return { ok: false, error: "wrong_course" };
  }

  const settings = await getFinal558Settings();
  if (!settings) {
    return { ok: false, error: "no_settings" };
  }

  const now = Date.now();
  if (now < settings.windowStart.getTime() || now > settings.windowEnd.getTime()) {
    return {
      ok: false,
      error: "outside_window",
      errorMeta: {
        windowStart: settings.windowStart,
        windowEnd: settings.windowEnd,
      },
    };
  }

  // Has this user already completed a final?
  const existingScore = await prisma.final558Score.findUnique({
    where: { userId },
  });
  if (existingScore) {
    return {
      ok: false,
      error: "already_attempted",
      errorMeta: { completedAt: existingScore.createdAt },
    };
  }

  // Is the user locked out?
  const lockout = await getLockoutStatus(userId);
  if (lockout.locked) {
    return {
      ok: false,
      error: "locked",
      errorMeta: { unlockAt: lockout.unlockAt ?? undefined },
    };
  }

  return { ok: true };
}

// Verify the cohort password against the stored hash. Records attempt.
// Returns true on success and issues the auth cookie; returns lockout
// status on failure.
export async function verifyFinalPassword(
  userId: string,
  password: string
): Promise<
  | { ok: true }
  | { ok: false; locked: boolean; unlockAt: Date | null; remaining: number }
> {
  const lockout = await getLockoutStatus(userId);
  if (lockout.locked) {
    return {
      ok: false,
      locked: true,
      unlockAt: lockout.unlockAt,
      remaining: 0,
    };
  }

  const settings = await getFinal558Settings();
  if (!settings) {
    return { ok: false, locked: false, unlockAt: null, remaining: lockout.remaining };
  }

  const valid = await bcrypt.compare(password, settings.password);
  await recordAttempt(userId, valid);

  if (!valid) {
    const updated = await getLockoutStatus(userId);
    return {
      ok: false,
      locked: updated.locked,
      unlockAt: updated.unlockAt,
      remaining: updated.remaining,
    };
  }

  await issueFinalAuthCookie(userId);
  return { ok: true };
}

export async function hasValidFinalAuthCookie(userId: string): Promise<boolean> {
  const cookie = await readFinalAuthCookie();
  return !!cookie && cookie.userId === userId;
}

// Format a date in a friendly way for error messages.
// Example: "Tuesday, May 5 at 10:00 AM Central"
export function formatWindowDate(d: Date): string {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const day = days[d.getDay()];
  const month = months[d.getMonth()];
  const date = d.getDate();
  let hour = d.getHours();
  const minute = d.getMinutes();
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  const minStr = minute.toString().padStart(2, "0");
  return `${day}, ${month} ${date} at ${hour}:${minStr} ${ampm} Central`;
}

export function formatTimeShort(d: Date): string {
  let hour = d.getHours();
  const minute = d.getMinutes();
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  const minStr = minute.toString().padStart(2, "0");
  return `${hour}:${minStr} ${ampm}`;
}
