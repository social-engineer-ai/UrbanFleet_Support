import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: List all teams with members
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || !["instructor", "ta"].includes(user.role)) {
    return Response.json({ error: "Admin access required" }, { status: 403 });
  }

  const teams = await prisma.team.findMany({
    orderBy: { name: "asc" },
    include: {
      members: {
        select: { id: true, name: true, email: true, course: true },
        orderBy: { name: "asc" },
      },
    },
  });

  // Also get unassigned students
  const unassigned = await prisma.user.findMany({
    where: { role: "student", emailVerified: true, teamId: null },
    select: { id: true, name: true, email: true, course: true },
    orderBy: { name: "asc" },
  });

  return Response.json({ teams, unassigned });
}

// POST: Create a team
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || !["instructor", "ta"].includes(user.role)) {
    return Response.json({ error: "Admin access required" }, { status: 403 });
  }

  const { name, course, memberEmails } = await req.json();

  if (!name || !course) {
    return Response.json({ error: "Team name and course required" }, { status: 400 });
  }

  const team = await prisma.team.create({
    data: { name, course },
  });

  // Assign members if provided
  if (memberEmails && Array.isArray(memberEmails) && memberEmails.length > 0) {
    await prisma.user.updateMany({
      where: { email: { in: memberEmails }, role: "student" },
      data: { teamId: team.id },
    });
  }

  return Response.json({ success: true, teamId: team.id, name });
}

// PUT: Update team (add/remove members)
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || !["instructor", "ta"].includes(user.role)) {
    return Response.json({ error: "Admin access required" }, { status: 403 });
  }

  const { teamId, action, studentEmail } = await req.json();

  if (!teamId || !action || !studentEmail) {
    return Response.json({ error: "teamId, action, and studentEmail required" }, { status: 400 });
  }

  if (action === "add") {
    await prisma.user.updateMany({
      where: { email: studentEmail, role: "student" },
      data: { teamId },
    });
    return Response.json({ success: true, message: `Added ${studentEmail} to team` });
  }

  if (action === "remove") {
    await prisma.user.updateMany({
      where: { email: studentEmail, teamId },
      data: { teamId: null },
    });
    return Response.json({ success: true, message: `Removed ${studentEmail} from team` });
  }

  return Response.json({ error: "Invalid action. Use 'add' or 'remove'" }, { status: 400 });
}

// DELETE: Delete a team
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || user.role !== "instructor") {
    return Response.json({ error: "Instructor access required" }, { status: 403 });
  }

  const { teamId } = await req.json();
  if (!teamId) {
    return Response.json({ error: "teamId required" }, { status: 400 });
  }

  // Unassign all members first
  await prisma.user.updateMany({
    where: { teamId },
    data: { teamId: null },
  });

  await prisma.team.delete({ where: { id: teamId } });
  return Response.json({ success: true });
}
