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
