import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { gradeFinalSession } from "@/lib/final558/grade";

// POST /api/admin/final-558/sessions/[id]/regrade
// Force a re-grade. Replaces any existing AI score, but preserves
// instructor overrides + reviewer attribution. The grader is synchronous —
// expect ~30-60s while Opus runs.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || user.role !== "instructor") {
    return Response.json({ error: "Instructor access required" }, { status: 403 });
  }

  const { id } = await params;
  const result = await gradeFinalSession(id, { force: true });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 500 });
  }
  return Response.json({ ok: true, aggregate: result.aggregate });
}
