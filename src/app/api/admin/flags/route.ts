import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { evaluateAllStudentFlags, resolveFlag } from "@/lib/grading/flags";

// GET: Evaluate and return flags for all students
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || !["instructor", "ta"].includes(user.role)) {
    return Response.json({ error: "Admin access required" }, { status: 403 });
  }

  const allFlags = await evaluateAllStudentFlags();

  // Enrich with student names
  const students = await prisma.user.findMany({
    where: { role: "student" },
    select: { id: true, name: true, email: true, course: true },
  });

  const studentMap = Object.fromEntries(students.map((s) => [s.id, s]));

  const flaggedStudents = Object.entries(allFlags)
    .filter(([, flags]) => flags.some((f) => !f.resolved))
    .map(([userId, flags]) => ({
      student: studentMap[userId] || { id: userId, name: "Unknown", email: "", course: "" },
      flags: flags.filter((f) => !f.resolved),
    }))
    .sort((a, b) => b.flags.length - a.flags.length);

  return Response.json(flaggedStudents);
}

// PUT: Resolve a flag
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || !["instructor", "ta"].includes(user.role)) {
    return Response.json({ error: "Admin access required" }, { status: 403 });
  }

  const { userId, flagType } = await req.json();
  if (!userId || !flagType) {
    return Response.json({ error: "userId and flagType required" }, { status: 400 });
  }

  await resolveFlag(userId, flagType);
  return Response.json({ success: true });
}
