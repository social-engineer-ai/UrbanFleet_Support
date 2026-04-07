import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || !["instructor", "ta"].includes(user.role)) {
    return Response.json({ error: "Admin access required" }, { status: 403 });
  }

  const students = await prisma.user.findMany({
    where: { role: "student", emailVerified: true },
    orderBy: { name: "asc" },
    include: {
      studentState: { select: { stateJson: true } },
      conversations: { select: { agentType: true, persona: true, messageCount: true } },
    },
  });

  const headers = [
    "Name",
    "Email",
    "Course",
    "Team",
    // Engagement (50 pts: 10 per role)
    "Engagement: Elena (10)",
    "Engagement: Marcus (10)",
    "Engagement: Priya (10)",
    "Engagement: James (10)",
    "Engagement: Mentor (10)",
    "Engagement Total (50)",
    // Problem Understanding (30 pts: 5 per stakeholder + 10 mentor quality)
    "Understanding: Elena (5)",
    "Understanding: Marcus (5)",
    "Understanding: Priya (5)",
    "Understanding: James (5)",
    "Mentor Quality (10)",
    "Understanding Total (30)",
    // Solution Explanation (20 pts: 5 per stakeholder)
    "Explanation: Elena (5)",
    "Explanation: Marcus (5)",
    "Explanation: Priya (5)",
    "Explanation: James (5)",
    "Explanation Total (20)",
    // Grand total
    "Individual Total (100)",
    // Activity
    "Client Meetings",
    "Mentor Sessions",
    "Total Messages",
    "Requirements Discovered",
    "Architecture Decisions",
    "Phase 1",
    "Phase 2",
    "Phase 3",
    "Phase 4",
    "Deep Reflections",
    "Medium Reflections",
    "Shallow Reflections",
  ];

  const rows = students.map((s) => {
    const state = s.studentState ? JSON.parse(s.studentState.stateJson) : null;
    const sc = state?.conversation_scores || {};
    const eng = sc.engagement || {};
    const und = sc.problem_understanding || {};
    const exp = sc.solution_explanation || {};
    const hints = state?.hint_log || [];
    const reqs = state?.requirements_uncovered || {};
    const bp = state?.build_progress || {};

    const engTotal = (eng.elena || 0) + (eng.marcus || 0) + (eng.priya || 0) + (eng.james || 0) + (eng.mentor || 0);
    const undTotal = (und.elena || 0) + (und.marcus || 0) + (und.priya || 0) + (und.james || 0) + (und.mentor_quality || 0);
    const expTotal = (exp.elena || 0) + (exp.marcus || 0) + (exp.priya || 0) + (exp.james || 0);
    const grandTotal = engTotal + undTotal + expTotal;

    const reqCount = Object.values(reqs).filter((r: unknown) => (r as { discovered: boolean }).discovered).length;
    const decisionCount = (state?.architecture_decisions || []).length;
    const clientMeetings = s.conversations.filter((c) => c.agentType === "client").length;
    const mentorSessions = s.conversations.filter((c) => c.agentType === "mentor").length;
    const totalMessages = s.conversations.reduce((sum, c) => sum + c.messageCount, 0);

    return [
      s.name, s.email, s.course || "", s.teamId || "",
      eng.elena || 0, eng.marcus || 0, eng.priya || 0, eng.james || 0, eng.mentor || 0, engTotal,
      und.elena || 0, und.marcus || 0, und.priya || 0, und.james || 0, und.mentor_quality || 0, undTotal,
      exp.elena || 0, exp.marcus || 0, exp.priya || 0, exp.james || 0, expTotal,
      grandTotal,
      clientMeetings, mentorSessions, totalMessages, reqCount, decisionCount,
      bp.phase_1?.status || "not_started",
      bp.phase_2?.status || "not_started",
      bp.phase_3?.status || "not_started",
      bp.phase_4?.status || "not_started",
      hints.filter((h: { reflection_quality: string }) => h.reflection_quality === "deep").length,
      hints.filter((h: { reflection_quality: string }) => h.reflection_quality === "medium").length,
      hints.filter((h: { reflection_quality: string }) => h.reflection_quality === "shallow").length,
    ];
  });

  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      row.map((cell) => {
        const str = String(cell);
        return str.includes(",") || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(",")
    ),
  ].join("\n");

  return new Response(csvContent, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="stakeholdersim_grades_${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
