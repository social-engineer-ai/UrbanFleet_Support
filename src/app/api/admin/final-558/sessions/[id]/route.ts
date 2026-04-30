import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  computeAggregate,
  DEFAULT_WEIGHTS,
  type GraderOutput,
} from "@/lib/agents/final558";

async function requireInstructor() {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false as const,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
      userId: null,
    };
  }
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || !["instructor", "ta"].includes(user.role)) {
    return {
      ok: false as const,
      response: Response.json({ error: "Instructor access required" }, { status: 403 }),
      userId: null,
    };
  }
  return { ok: true as const, userId: session.user.id };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireInstructor();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  const session = await prisma.final558Session.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, course: true } },
      score: true,
      coverage: true,
      events: { orderBy: { timestamp: "asc" } },
      conversation: {
        include: {
          messages: {
            where: { role: { not: "system" } },
            orderBy: { timestamp: "asc" },
            select: {
              id: true,
              role: true,
              content: true,
              metadata: true,
              timestamp: true,
            },
          },
        },
      },
    },
  });
  if (!session) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  let raw: GraderOutput | null = null;
  let overrides: Record<string, number> = {};
  let aggregate: number | null = null;
  if (session.score) {
    try {
      raw = JSON.parse(session.score.rawJson) as GraderOutput;
    } catch {
      raw = null;
    }
    if (session.score.instructorEdit) {
      try {
        overrides = JSON.parse(session.score.instructorEdit) as Record<string, number>;
      } catch {
        overrides = {};
      }
    }
    aggregate = raw
      ? computeAggregate(raw, DEFAULT_WEIGHTS, overrides)
      : session.score.aggregate;
  }

  return Response.json({
    sessionId: session.id,
    user: session.user,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? null,
    endReason: session.endReason,
    flagged: session.flaggedForReview,
    flagReasons: session.flagReasons ? JSON.parse(session.flagReasons) : [],
    pasteCharCount: session.pasteCharCount,
    typedCharCount: session.typedCharCount,
    tabHiddenCount: session.tabHiddenCount,
    tabHiddenSeconds: session.tabHiddenSeconds,
    coverage: session.coverage.map((c) => ({
      stakeholder: c.stakeholder,
      point: c.point,
    })),
    messages: session.conversation.messages.map((m) => {
      let stakeholder: string | undefined;
      if (m.metadata) {
        try {
          stakeholder = (JSON.parse(m.metadata) as { stakeholder?: string })
            .stakeholder;
        } catch {
          /* ignore */
        }
      }
      return {
        id: m.id,
        role: m.role,
        content: m.content,
        stakeholder,
        timestamp: m.timestamp.toISOString(),
      };
    }),
    events: session.events.map((e) => ({
      id: e.id,
      type: e.type,
      payload: tryParse(e.payload),
      timestamp: e.timestamp.toISOString(),
    })),
    rawScores: raw,
    overrides,
    aggregate,
    reviewedBy: session.score?.reviewedBy ?? null,
    reviewedAt: session.score?.reviewedAt?.toISOString() ?? null,
  });
}

// PUT: instructor updates the override map for a session. If no AI grade
// exists yet (grader never ran or failed), creates a manual-only score row
// so overrides still flow through.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireInstructor();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const overrides = (body?.overrides ?? {}) as Record<string, number>;

  for (const v of Object.values(overrides)) {
    if (typeof v !== "number" || v < 0 || v > 5) {
      return Response.json({ error: "Override values must be 0-5" }, { status: 400 });
    }
  }

  const session = await prisma.final558Session.findUnique({
    where: { id },
    select: { id: true, userId: true },
  });
  if (!session) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  const existing = await prisma.final558Score.findUnique({
    where: { sessionId: id },
  });

  let raw: GraderOutput | null = null;
  if (existing && existing.rawJson && existing.rawJson !== "{}") {
    try {
      raw = JSON.parse(existing.rawJson) as GraderOutput;
    } catch {
      raw = null;
    }
  }

  const aggregate = computeAggregate(raw, DEFAULT_WEIGHTS, overrides);
  const overridesJson = JSON.stringify(overrides);
  const now = new Date();

  if (existing) {
    await prisma.final558Score.update({
      where: { sessionId: id },
      data: {
        instructorEdit: overridesJson,
        aggregate,
        reviewedBy: guard.userId,
        reviewedAt: now,
      },
    });
  } else {
    // Manual-only score: create a placeholder score row with rawJson === "{}"
    // so a future re-grade knows it should overwrite, not skip.
    await prisma.final558Score.create({
      data: {
        sessionId: id,
        userId: session.userId,
        rawJson: "{}",
        aggregate,
        instructorEdit: overridesJson,
        reviewedBy: guard.userId,
        reviewedAt: now,
      },
    });
  }

  return Response.json({ ok: true, aggregate });
}

function tryParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
