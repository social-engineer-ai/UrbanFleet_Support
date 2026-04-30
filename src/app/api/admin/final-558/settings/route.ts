import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const FINAL_558_COURSE = "558";

async function requireInstructor() {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || user.role !== "instructor") {
    return { ok: false as const, response: Response.json({ error: "Instructor access required" }, { status: 403 }) };
  }
  return { ok: true as const, userId: session.user.id };
}

export async function GET() {
  const guard = await requireInstructor();
  if (!guard.ok) return guard.response;

  const settings = await prisma.final558Settings.findUnique({
    where: { course: FINAL_558_COURSE },
  });

  if (!settings) {
    return Response.json({
      configured: false,
      windowStart: null,
      windowEnd: null,
      weights: null,
      forcedEntryAt: 1320,
      hardCutoffAt: 4200,
    });
  }

  return Response.json({
    configured: true,
    windowStart: settings.windowStart.toISOString(),
    windowEnd: settings.windowEnd.toISOString(),
    weights: JSON.parse(settings.weights),
    forcedEntryAt: settings.forcedEntryAt,
    hardCutoffAt: settings.hardCutoffAt,
    updatedAt: settings.updatedAt.toISOString(),
  });
}

interface SettingsPayload {
  password?: string;
  windowStart?: string;
  windowEnd?: string;
  weights?: { perCoveragePoint?: number; perCrossCutting?: number };
  forcedEntryAt?: number;
  hardCutoffAt?: number;
}

export async function POST(req: NextRequest) {
  const guard = await requireInstructor();
  if (!guard.ok) return guard.response;

  const body: SettingsPayload = await req.json().catch(() => ({}));

  const existing = await prisma.final558Settings.findUnique({
    where: { course: FINAL_558_COURSE },
  });

  // Validate window dates if provided.
  let windowStart: Date | undefined;
  let windowEnd: Date | undefined;
  if (body.windowStart) {
    windowStart = new Date(body.windowStart);
    if (Number.isNaN(windowStart.getTime())) {
      return Response.json({ error: "Invalid windowStart" }, { status: 400 });
    }
  }
  if (body.windowEnd) {
    windowEnd = new Date(body.windowEnd);
    if (Number.isNaN(windowEnd.getTime())) {
      return Response.json({ error: "Invalid windowEnd" }, { status: 400 });
    }
  }
  if (windowStart && windowEnd && windowEnd.getTime() <= windowStart.getTime()) {
    return Response.json(
      { error: "windowEnd must be after windowStart" },
      { status: 400 }
    );
  }

  const weightsJson = body.weights
    ? JSON.stringify({
        perCoveragePoint: body.weights.perCoveragePoint ?? 0.05,
        perCrossCutting: body.weights.perCrossCutting ?? 0.0667,
      })
    : existing?.weights ??
      JSON.stringify({ perCoveragePoint: 0.05, perCrossCutting: 0.0667 });

  // First-time setup requires a password.
  if (!existing && !body.password) {
    return Response.json(
      { error: "Password is required for initial setup" },
      { status: 400 }
    );
  }
  if (!existing && (!windowStart || !windowEnd)) {
    return Response.json(
      { error: "windowStart and windowEnd are required for initial setup" },
      { status: 400 }
    );
  }

  const passwordHash = body.password
    ? await bcrypt.hash(body.password, 10)
    : existing!.password;

  const saved = await prisma.final558Settings.upsert({
    where: { course: FINAL_558_COURSE },
    create: {
      course: FINAL_558_COURSE,
      password: passwordHash,
      windowStart: windowStart!,
      windowEnd: windowEnd!,
      weights: weightsJson,
      forcedEntryAt: body.forcedEntryAt ?? 1320,
      hardCutoffAt: body.hardCutoffAt ?? 4200,
    },
    update: {
      ...(body.password ? { password: passwordHash } : {}),
      ...(windowStart ? { windowStart } : {}),
      ...(windowEnd ? { windowEnd } : {}),
      weights: weightsJson,
      ...(body.forcedEntryAt !== undefined ? { forcedEntryAt: body.forcedEntryAt } : {}),
      ...(body.hardCutoffAt !== undefined ? { hardCutoffAt: body.hardCutoffAt } : {}),
    },
  });

  return Response.json({
    configured: true,
    windowStart: saved.windowStart.toISOString(),
    windowEnd: saved.windowEnd.toISOString(),
    weights: JSON.parse(saved.weights),
    forcedEntryAt: saved.forcedEntryAt,
    hardCutoffAt: saved.hardCutoffAt,
    passwordUpdated: !!body.password,
  });
}
