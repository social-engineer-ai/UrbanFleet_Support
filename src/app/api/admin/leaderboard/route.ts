import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SCENARIOS, BONUS_POINTS } from "@/lib/leaderboard/scenarios";

// GET: Get leaderboard for a course section
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const course = req.nextUrl.searchParams.get("course") || "558";

  const entries = await prisma.leaderboardEntry.findMany({
    where: { course },
    orderBy: { finalScore: "desc" },
    include: {
      team: {
        include: {
          members: { select: { name: true, email: true } },
        },
      },
    },
  });

  const leaderboard = entries.map((entry, index) => ({
    rank: index + 1,
    teamId: entry.teamId,
    teamName: entry.team.name,
    members: entry.team.members,
    baselineScore: entry.baselineScore,
    enhancedScore: entry.enhancedScore,
    innovationScore: entry.innovationScore,
    qualityMultiplier: entry.qualityMultiplier,
    finalScore: entry.finalScore,
    scenarioResults: JSON.parse(entry.scenarioResults),
    bonus: BONUS_POINTS[index + 1] || 0,
    auditedAt: entry.auditedAt?.toISOString() || null,
  }));

  return Response.json({
    course,
    scenarios: SCENARIOS,
    leaderboard,
    updatedAt: entries[0]?.updatedAt?.toISOString() || null,
  });
}

// POST: Score a team (instructor only)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || !["instructor", "ta"].includes(user.role)) {
    return Response.json({ error: "Admin access required" }, { status: 403 });
  }

  const { teamId, scenarioResults, qualityMultiplier, innovationScores, auditNotes } = await req.json();

  if (!teamId || !scenarioResults) {
    return Response.json({ error: "teamId and scenarioResults required" }, { status: 400 });
  }

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) {
    return Response.json({ error: "Team not found" }, { status: 404 });
  }

  // Calculate scores
  let baselineScore = 0;
  let enhancedScore = 0;

  for (const scenario of SCENARIOS) {
    const result = scenarioResults[scenario.id];
    if (result?.passed) {
      if (scenario.tier === "baseline") baselineScore += scenario.points;
      if (scenario.tier === "enhanced") enhancedScore += result.score || scenario.points;
    }
  }

  const innovationScore = (innovationScores || []).reduce(
    (sum: number, s: { score: number }) => sum + Math.min(s.score || 0, 15),
    0
  );

  const qm = Math.max(0.8, Math.min(1.2, qualityMultiplier || 1.0));
  const finalScore = Math.round((baselineScore + enhancedScore + innovationScore) * qm * 10) / 10;

  const entry = await prisma.leaderboardEntry.upsert({
    where: { id: (await prisma.leaderboardEntry.findFirst({ where: { teamId } }))?.id || "new" },
    update: {
      baselineScore,
      enhancedScore,
      innovationScore,
      qualityMultiplier: qm,
      finalScore,
      scenarioResults: JSON.stringify(scenarioResults),
      auditedAt: new Date(),
      auditNotes: auditNotes || null,
    },
    create: {
      teamId,
      course: team.course,
      baselineScore,
      enhancedScore,
      innovationScore,
      qualityMultiplier: qm,
      finalScore,
      scenarioResults: JSON.stringify(scenarioResults),
      auditedAt: new Date(),
      auditNotes: auditNotes || null,
    },
  });

  return Response.json({
    success: true,
    teamId,
    baselineScore,
    enhancedScore,
    innovationScore,
    qualityMultiplier: qm,
    finalScore,
    entryId: entry.id,
  });
}
