import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  computeAggregate,
  DEFAULT_WEIGHTS,
  type GraderOutput,
  FINAL_STAKEHOLDERS,
} from "@/lib/agents/final558";

async function requireInstructor() {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || !["instructor", "ta"].includes(user.role)) {
    return { ok: false as const, response: Response.json({ error: "Instructor access required" }, { status: 403 }) };
  }
  return { ok: true as const };
}

export async function GET() {
  const guard = await requireInstructor();
  if (!guard.ok) return guard.response;

  const sessions = await prisma.final558Session.findMany({
    orderBy: { startedAt: "desc" },
    include: {
      user: { select: { id: true, name: true, email: true } },
      score: true,
    },
  });

  const rows = sessions.map((s) => {
    let aggregate: number | null = null;
    if (s.score) {
      try {
        const raw = JSON.parse(s.score.rawJson) as GraderOutput;
        const overrides = s.score.instructorEdit
          ? (JSON.parse(s.score.instructorEdit) as Record<string, number>)
          : {};
        aggregate = computeAggregate(raw, DEFAULT_WEIGHTS, overrides);
      } catch {
        aggregate = s.score.aggregate;
      }
    }
    const durationSec = s.endedAt
      ? Math.floor((s.endedAt.getTime() - s.startedAt.getTime()) / 1000)
      : null;
    return {
      sessionId: s.id,
      userId: s.user.id,
      studentName: s.user.name,
      email: s.user.email,
      startedAt: s.startedAt.toISOString(),
      endedAt: s.endedAt?.toISOString() ?? null,
      endReason: s.endReason,
      durationSec,
      flagged: s.flaggedForReview,
      flagReasons: s.flagReasons ? JSON.parse(s.flagReasons) : [],
      aggregate,
      reviewedAt: s.score?.reviewedAt?.toISOString() ?? null,
      hasScore: !!s.score,
    };
  });

  return Response.json({ sessions: rows, stakeholders: FINAL_STAKEHOLDERS });
}
