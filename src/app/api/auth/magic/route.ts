import { NextRequest, NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

// One-shot magic-link login. The student clicks a URL of the form
//   /api/auth/magic?token=<base64url-payload>.<base64url-hmac>
// and the route verifies the HMAC, mints a NextAuth session JWT for the
// indicated user, sets the session-token cookie, and redirects to /chat.
//
// Tokens are short-lived (the generator below caps at 24h). They are NOT
// single-use; if a link leaks, anyone with it can log in as that user
// until expiry. Generate sparingly and share privately. Used for cases
// where a student can't get past the regular login form (browser /
// network issue) but the server is otherwise willing to authenticate
// them.
//
// Same secret as NextAuth uses for session JWT (NEXTAUTH_SECRET /
// AUTH_SECRET). The salt for v5's session cookie is the cookie name
// "authjs.session-token".

const SESSION_COOKIE_NAME = "authjs.session-token";

function getSecret(): string {
  const s = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!s) throw new Error("NEXTAUTH_SECRET or AUTH_SECRET not set");
  return s;
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

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return new Response("missing token", { status: 400 });
  }

  const dot = token.lastIndexOf(".");
  if (dot < 0) {
    return new Response("malformed token", { status: 400 });
  }
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  let secret: string;
  try {
    secret = getSecret();
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "secret not set", {
      status: 500,
    });
  }

  const expected = await hmac(body, secret);
  if (sig !== expected) {
    return new Response("invalid signature", { status: 401 });
  }

  let payload: { userId?: string; exp?: number };
  try {
    payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf-8")
    ) as { userId?: string; exp?: number };
  } catch {
    return new Response("malformed payload", { status: 400 });
  }

  if (!payload.userId || !payload.exp) {
    return new Response("missing fields", { status: 400 });
  }
  if (Date.now() > payload.exp) {
    return new Response("token expired", { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
  });
  if (!user) {
    return new Response("user not found", { status: 404 });
  }

  // Build claims that match what auth.ts's JWT and session callbacks
  // produce on a normal credentials sign-in.
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    sub: user.id,
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    course: user.course,
    iat: now,
    exp: now + 30 * 24 * 60 * 60, // 30 days, same as NextAuth default
  };

  const sessionToken = await encode({
    token: claims,
    secret,
    salt: SESSION_COOKIE_NAME,
  });

  const res = NextResponse.redirect(new URL("/chat", req.url));
  res.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: false,
    maxAge: 30 * 24 * 60 * 60,
  });
  return res;
}
