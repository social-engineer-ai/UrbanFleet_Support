import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AdminDashboard } from "@/components/AdminDashboard";

export default async function AdminPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });

  if (!user || !["instructor", "ta"].includes(user.role)) {
    redirect("/chat");
  }

  // Get all students with their conversation counts and states
  const students = await prisma.user.findMany({
    where: { role: "student" },
    orderBy: { name: "asc" },
    include: {
      conversations: {
        select: {
          id: true,
          agentType: true,
          persona: true,
          meetingType: true,
          startedAt: true,
          endedAt: true,
          messageCount: true,
          summary: true,
        },
        orderBy: { startedAt: "desc" },
      },
      studentState: {
        select: { stateJson: true, updatedAt: true },
      },
    },
  });

  // Build per-student Part 1/2/3 coverage from the conversations we already fetched.
  function computeCoverage(convs: typeof students[number]["conversations"]) {
    const cov: Record<string, { requirements: number; solution: number; features: number; practice: number }> = {
      elena: { requirements: 0, solution: 0, features: 0, practice: 0 },
      marcus: { requirements: 0, solution: 0, features: 0, practice: 0 },
      priya: { requirements: 0, solution: 0, features: 0, practice: 0 },
      james: { requirements: 0, solution: 0, features: 0, practice: 0 },
    };
    for (const c of convs) {
      if (c.agentType !== "client" || !c.persona || !c.endedAt) continue;
      const persona = c.persona;
      const mt = c.meetingType;
      if (persona in cov && mt in cov[persona]) {
        cov[persona][mt as keyof typeof cov[string]] += 1;
      }
    }
    let p1Done = 0, p2Done = 0, p3Done = 0;
    for (const p of ["elena", "marcus", "priya", "james"] as const) {
      if (cov[p].requirements > 0) p1Done += 1;
      if (cov[p].solution > 0) p2Done += 1;
      if (cov[p].features > 0) p3Done += 1;
    }
    return { byPersona: cov, totals: { p1Done, p2Done, p3Done } };
  }

  const studentsData = students.map((s) => ({
    id: s.id,
    name: s.name,
    email: s.email,
    course: s.course,
    teamId: s.teamId,
    createdAt: s.createdAt.toISOString(),
    totalConversations: s.conversations.length,
    clientMeetings: s.conversations.filter((c) => c.agentType === "client").length,
    mentorSessions: s.conversations.filter((c) => c.agentType === "mentor").length,
    coverage: computeCoverage(s.conversations),
    lastActive: s.conversations[0]?.startedAt.toISOString() || null,
    conversations: s.conversations.map((c) => ({
      ...c,
      startedAt: c.startedAt.toISOString(),
      endedAt: c.endedAt?.toISOString() || null,
    })),
    state: s.studentState ? JSON.parse(s.studentState.stateJson) : null,
  }));

  const isInstructor = user.role === "instructor";

  return <AdminDashboard students={studentsData} isInstructor={isInstructor} />;
}
