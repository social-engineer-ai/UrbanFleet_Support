import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStudentState } from "@/lib/agents/state";

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

  // Scores (expose as qualitative bands, not raw numbers)
  const clientScores = state.conversation_scores.client;
  const mentorScores = state.conversation_scores.mentor;

  return Response.json({
    name: state.student_name,
    course: state.course,
    requirements: {
      items: requirements,
      discovered: reqDiscovered,
      total: requirements.length,
    },
    reflections: reflectionBreakdown,
    phases,
    decisionsCount,
    conversations: {
      clientMeetings,
      mentorSessions,
      personasMet,
      totalMeetings: clientScores.total_meetings,
      totalSessions: mentorScores.total_sessions,
    },
    // Qualitative progress indicators (not raw scores)
    indicators: {
      requirementsProgress: reqDiscovered >= 6 ? "strong" : reqDiscovered >= 4 ? "good" : reqDiscovered >= 2 ? "developing" : "early",
      reflectionQuality: reflectionBreakdown.total === 0 ? "no_data" :
        (reflectionBreakdown.deep / reflectionBreakdown.total) >= 0.5 ? "strong" :
        (reflectionBreakdown.deep + reflectionBreakdown.medium) / reflectionBreakdown.total >= 0.6 ? "good" : "developing",
      engagement: (clientMeetings + mentorSessions) >= 8 ? "strong" : (clientMeetings + mentorSessions) >= 4 ? "good" : "early",
      stakeholderCoverage: personasMet.length >= 4 ? "complete" : personasMet.length >= 3 ? "good" : personasMet.length >= 1 ? "developing" : "not_started",
    },
  });
}
