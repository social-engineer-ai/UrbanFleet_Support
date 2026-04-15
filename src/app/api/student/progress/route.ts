import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStudentState } from "@/lib/agents/state";
import { computeClientCoverage, coverageTotals } from "@/lib/coverage";
import { DEADLINES } from "@/lib/deadlines";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || user.role !== "student") {
    return Response.json({ error: "Student access only" }, { status: 403 });
  }

  const state = await getStudentState(session.user.id);

  // Requirements progress
  const requirements = Object.entries(state.requirements_uncovered).map(([key, val]) => ({
    key,
    label: key.replace(/_/g, " "),
    discovered: val.discovered,
    persona: val.persona || null,
  }));
  const reqDiscovered = requirements.filter((r) => r.discovered).length;

  // Reflection quality breakdown
  const hints = state.hint_log || [];
  const reflectionBreakdown = {
    total: hints.length,
    deep: hints.filter((h) => h.reflection_quality === "deep").length,
    medium: hints.filter((h) => h.reflection_quality === "medium").length,
    shallow: hints.filter((h) => h.reflection_quality === "shallow").length,
    forgiven: hints.filter((h) => h.forgiven).length,
  };

  // Build progress
  const phases = Object.entries(state.build_progress).map(([key, val]) => ({
    key,
    label: key.replace(/_/g, " ").replace("phase", "Phase"),
    status: val.status,
  }));

  // Architecture decisions count
  const decisionsCount = (state.architecture_decisions || []).length;

  // Conversations
  const conversations = await prisma.conversation.findMany({
    where: { userId: session.user.id },
    select: { agentType: true, persona: true, endedAt: true },
  });

  const clientMeetings = conversations.filter((c) => c.agentType === "client").length;
  const mentorSessions = conversations.filter((c) => c.agentType === "mentor").length;
  const personasMet = [...new Set(conversations.filter((c) => c.agentType === "client").map((c) => c.persona))];

  // Per-type, per-persona coverage for the new dashboard sections
  const coverage = await computeClientCoverage(session.user.id);
  const coverageTotalsData = coverageTotals(coverage);

  // Engagement scores per persona
  const engagement = state.conversation_scores.engagement || {};
  const engagementTotal = Object.values(engagement).reduce((sum: number, v) => sum + (v as number || 0), 0);

  // Filter phases based on course
  const coursePhases = state.course === "358"
    ? phases.filter((p) => p.key !== "phase_4")
    : phases;

  return Response.json({
    name: state.student_name,
    course: state.course,
    requirements: {
      items: requirements,
      discovered: reqDiscovered,
      total: requirements.length,
    },
    reflections: reflectionBreakdown,
    phases: coursePhases,
    decisionsCount,
    conversations: {
      clientMeetings,
      mentorSessions,
      personasMet,
      totalMeetings: state.conversation_scores.total_meetings,
      totalSessions: state.conversation_scores.total_sessions,
    },
    coverage,
    coverageTotals: coverageTotalsData,
    deadlines: DEADLINES,
    engagement: {
      elena: engagement.elena || 0,
      marcus: engagement.marcus || 0,
      priya: engagement.priya || 0,
      james: engagement.james || 0,
      mentor: engagement.mentor || 0,
      total: engagementTotal,
    },
    indicators: {
      requirementsProgress: reqDiscovered >= 6 ? "strong" : reqDiscovered >= 4 ? "good" : reqDiscovered >= 2 ? "developing" : "early",
      reflectionQuality: reflectionBreakdown.total === 0 ? "no_data" :
        (reflectionBreakdown.deep / reflectionBreakdown.total) >= 0.5 ? "strong" :
        (reflectionBreakdown.deep + reflectionBreakdown.medium) / reflectionBreakdown.total >= 0.6 ? "good" : "developing",
      engagement: engagementTotal >= 40 ? "strong" : engagementTotal >= 25 ? "good" : engagementTotal >= 10 ? "developing" : "early",
      stakeholderCoverage: personasMet.length >= 4 ? "complete" : personasMet.length >= 3 ? "good" : personasMet.length >= 1 ? "developing" : "not_started",
    },
  });
}
