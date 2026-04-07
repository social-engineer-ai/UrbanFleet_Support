import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: List all TAs
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || user.role !== "instructor") {
    return Response.json({ error: "Instructor access required" }, { status: 403 });
  }

  const tas = await prisma.user.findMany({
    where: { role: "ta" },
    select: { id: true, name: true, email: true, createdAt: true },
    orderBy: { name: "asc" },
  });

  return Response.json(tas);
}

// POST: Add a new TA
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const currentUser = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!currentUser || currentUser.role !== "instructor") {
    return Response.json({ error: "Only the instructor can add TAs" }, { status: 403 });
  }

  const { email, name, password } = await req.json();

  if (!email || !name || !password) {
    return Response.json({ error: "Email, name, and password are required" }, { status: 400 });
  }

  if (!email.endsWith("@illinois.edu")) {
    return Response.json({ error: "Must use an @illinois.edu email" }, { status: 400 });
  }

  // Check if user exists
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.role === "instructor") {
      return Response.json({ error: "Cannot modify instructor account" }, { status: 400 });
    }
    // Upgrade existing student to TA, or update existing TA
    await prisma.user.update({
      where: { email },
      data: { role: "ta", name, emailVerified: true },
    });
    return Response.json({ success: true, message: `${email} upgraded to TA` });
  }

  // Create new TA account
  const hashed = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: {
      email,
      password: hashed,
      name,
      role: "ta",
      emailVerified: true,
    },
  });

  return Response.json({ success: true, message: `TA account created for ${email}` });
}

// DELETE: Remove a TA (demote to student or delete)
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const currentUser = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!currentUser || currentUser.role !== "instructor") {
    return Response.json({ error: "Only the instructor can remove TAs" }, { status: 403 });
  }

  const { email } = await req.json();
  if (!email) {
    return Response.json({ error: "Email required" }, { status: 400 });
  }

  const targetUser = await prisma.user.findUnique({ where: { email } });
  if (!targetUser) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  if (targetUser.role === "instructor") {
    return Response.json({ error: "Cannot remove instructor" }, { status: 400 });
  }

  if (targetUser.role !== "ta") {
    return Response.json({ error: "User is not a TA" }, { status: 400 });
  }

  await prisma.user.update({
    where: { email },
    data: { role: "student" },
  });

  return Response.json({ success: true, message: `${email} removed from TA role` });
}
