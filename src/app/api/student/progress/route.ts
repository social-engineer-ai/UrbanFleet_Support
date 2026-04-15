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

  // Engagement scores per persona. New shape: { elena: { requirements, solution }, ..., mentor: number }.
  // We compute Part 1 and Part 2 engagement separately so the UI can show a
  // distinct label for each and students whose state is still in the old shape
  // (single number) see their historical effort counted toward Part 1 only.
  const engagementRaw = state.conversation_scores.engagement || {};
  function personaPart1(p: string): number {
    const entry = (engagementRaw as Record<string, unknown>)[p];
    if (typeof entry === "number") {
      // Old shape: all pre-rescale conversations were Part 1 meetings, so the
      // single number represents Part 1 engagement. Cap at 5 to match the new scale.
      return Math.min(entry, 5);
    }
    if (entry && typeof entry === "object") {
      return (entry as { requirements?: number }).requirements || 0;
    }
    return 0;
  }
  function personaPart2(p: string): number {
    const entry = (engagementRaw as Record<string, unknown>)[p];
    if (typeof entry === "number") return 0; // Old shape: no Part 2 yet
    if (entry && typeof entry === "object") {
      return (entry as { solution?: number }).solution || 0;
    }
    return 0;
  }
  const CLIENT_PERSONAS = ["elena", "marcus", "priya", "james"] as const;
  const part1Total = CLIENT_PERSONAS.reduce((sum, p) => sum + personaPart1(p), 0); // 0..20
  const part2Total = CLIENT_PERSONAS.reduce((sum, p) => sum + personaPart2(p), 0); // 0..20

  // Display-friendly aggregate (Part 1 + Part 2 + mentor) used by other callers
  const engagement = {
    elena: personaPart1("elena") + personaPart2("elena"),
    marcus: personaPart1("marcus") + personaPart2("marcus"),
    priya: personaPart1("priya") + personaPart2("priya"),
    james: personaPart1("james") + personaPart2("james"),
    mentor: (engagementRaw as { mentor?: number }).mentor || 0,
  };
  const engagementTotal = engagement.elena + engagement.marcus + engagement.priya + engagement.james + engagement.mentor;

  // Thresholds for each part's engagement indicator (max 20 per part).
  // Part 2 stays "not_started" if the student has zero solution-meeting score yet.
  function labelForPart(total: number, hasAnyActivity: boolean): string {
    if (!hasAnyActivity) return "not_started";
    if (total >= 16) return "strong";
    if (total >= 12) return "good";
    if (total >= 6) return "developing";
    return "early";
  }
  const part1HasActivity = part1Total > 0;
  const part2HasActivity = part2Total > 0;
  const engagementPart1Label = labelForPart(part1Total, part1HasActivity);
  const engagementPart2Label = labelForPart(part2Total, part2HasActivity);

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
      ...engagement,
      total: engagementTotal,
    },
    indicators: {
      requirementsProgress: reqDiscovered >= 6 ? "strong" : reqDiscovered >= 4 ? "good" : reqDiscovered >= 2 ? "developing" : "early",
      reflectionQuality: reflectionBreakdown.total === 0 ? "no_data" :
        (reflectionBreakdown.deep / reflectionBreakdown.total) >= 0.5 ? "strong" :
        (reflectionBreakdown.deep + reflectionBreakdown.medium) / reflectionBreakdown.total >= 0.6 ? "good" : "developing",
      // Split into Part 1 (requirements meetings) and Part 2 (solution meetings).
      // Students who only did Part 1 see their Part 1 engagement label as-is and
      // Part 2 as "not_started" (pending), instead of watching a single aggregated
      // label drop when the rubric expanded.
      engagementPart1: engagementPart1Label,
      engagementPart2: engagementPart2Label,
      stakeholderCoverage: personasMet.length >= 4 ? "complete" : personasMet.length >= 3 ? "good" : personasMet.length >= 1 ? "developing" : "not_started",
    },
  });
}
