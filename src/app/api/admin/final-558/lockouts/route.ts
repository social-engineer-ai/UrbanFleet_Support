import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLockoutStatus } from "@/lib/final558/auth";

async function requireInstructor() {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || user.role !== "instructor") {
    return { ok: false as const, response: Response.json({ error: "Instructor access required" }, { status: 403 }) };
  }
  return { ok: true as const };
}

// List students currently locked out by the password gate.
export async function GET() {
  const guard = await requireInstructor();
  if (!guard.ok) return guard.response;

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  // Candidate users: anyone with a recent failed attempt.
  const recentFailures = await prisma.final558Attempt.findMany({
    where: { succeeded: false, attemptedAt: { gte: oneHourAgo } },
    distinct: ["userId"],
    select: { userId: true },
  });

  const locked: {
    userId: string;
    name: string;
    email: string;
    unlockAt: string;
  }[] = [];

  for (const row of recentFailures) {
    const status = await getLockoutStatus(row.userId);
    if (status.locked && status.unlockAt) {
      const user = await prisma.user.findUnique({
        where: { id: row.userId },
        select: { name: true, email: true },
      });
      if (user) {
        locked.push({
          userId: row.userId,
          name: user.name,
          email: user.email,
          unlockAt: status.unlockAt.toISOString(),
        });
      }
    }
  }

  return Response.json({ locked });
}

// Clear lockout for a specific user (write a "succeeded=true" sentinel
// so the rolling-window query stops counting older failures).
export async function POST(req: NextRequest) {
  const guard = await requireInstructor();
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => ({}));
  const userId = typeof body?.userId === "string" ? body.userId : "";
  if (!userId) {
    return Response.json({ error: "userId required" }, { status: 400 });
  }

  // Synthesize a successful attempt to reset the rolling-window failure count.
  // The sentinel is interpreted by getLockoutStatus as "stop counting older
  // failures". The student still has to enter the correct password to actually
  // proceed.
  await prisma.final558Attempt.create({
    data: { userId, succeeded: true },
  });

  return Response.json({ ok: true });
}
