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
      conversations: { select: { agentType: true, messageCount: true } },
    },
  });

  // CSV header
  const headers = [
    "Name",
    "Email",
    "Course",
    "Team",
    "Client Meetings",
    "Mentor Sessions",
    "Total Messages",
    "Requirements Discovered",
    "Architecture Decisions",
    "Phase 1 Status",
    "Phase 2 Status",
    "Phase 3 Status",
    "Phase 4 Status",
    "Requirements Elicitation (20)",
    "Solution Presentation (25)",
    "Handling Pushback (20)",
    "Business Awareness (15)",
    "Client Total (80)",
    "Question Quality (25)",
    "Reflection Depth (40)",
    "Iteration (30)",
    "Independence Growth (25)",
    "Mentor Total (120)",
    "Grand Total (200)",
    "Deep Reflections",
    "Medium Reflections",
    "Shallow Reflections",
    "Hints Forgiven",
  ];

  const rows = students.map((s) => {
    const state = s.studentState ? JSON.parse(s.studentState.stateJson) : null;
    const cs = state?.conversation_scores?.client || {};
    const ms = state?.conversation_scores?.mentor || {};
    const hints = state?.hint_log || [];
    const reqs = state?.requirements_uncovered || {};
    const bp = state?.build_progress || {};

    const reqCount = Object.values(reqs).filter((r: unknown) => (r as { discovered: boolean }).discovered).length;
    const decisionCount = (state?.architecture_decisions || []).length;

    const clientTotal = (cs.requirements_elicitation || 0) + (cs.solution_presentation || 0) +
      (cs.handling_pushback || 0) + (cs.business_awareness || 0);
    const mentorTotal = (ms.question_quality || 0) + (ms.reflection_depth || 0) +
      (ms.iteration || 0) + (ms.independence_growth || 0);

    const clientMsgs = s.conversations.filter((c) => c.agentType === "client");
    const mentorMsgs = s.conversations.filter((c) => c.agentType === "mentor");
    const totalMessages = s.conversations.reduce((sum, c) => sum + c.messageCount, 0);

    return [
      s.name,
      s.email,
      s.course || "",
      s.teamId || "",
      clientMsgs.length,
      mentorMsgs.length,
      totalMessages,
      reqCount,
      decisionCount,
      bp.phase_1?.status || "not_started",
      bp.phase_2?.status || "not_started",
      bp.phase_3?.status || "not_started",
      bp.phase_4?.status || "not_started",
      cs.requirements_elicitation || 0,
      cs.solution_presentation || 0,
      cs.handling_pushback || 0,
      cs.business_awareness || 0,
      clientTotal,
      ms.question_quality || 0,
      ms.reflection_depth || 0,
      ms.iteration || 0,
      ms.independence_growth || 0,
      mentorTotal,
      clientTotal + mentorTotal,
      hints.filter((h: { reflection_quality: string }) => h.reflection_quality === "deep").length,
      hints.filter((h: { reflection_quality: string }) => h.reflection_quality === "medium").length,
      hints.filter((h: { reflection_quality: string }) => h.reflection_quality === "shallow").length,
      hints.filter((h: { forgiven: boolean }) => h.forgiven).length,
    ];
  });

  // Build CSV
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
