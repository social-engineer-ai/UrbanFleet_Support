import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { gradeFinalSession } from "@/lib/final558/grade";
import { sendInstructorAlert } from "@/lib/email";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = authSession.user.id;

  const { id: sessionId } = await params;
  const body = await req.json().catch(() => ({}));
  const reason: string =
    body?.reason === "hard_cutoff" ? "hard_cutoff" : "student";

  const finalSession = await prisma.final558Session.findFirst({
    where: { id: sessionId, userId },
  });
  if (!finalSession) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  if (finalSession.endedAt) {
    return Response.json({
      ok: true,
      alreadyEnded: true,
    });
  }

  const now = new Date();
  await prisma.final558Session.update({
    where: { id: sessionId },
    data: {
      endedAt: now,
      lockedAt: now,
      endReason: reason,
    },
  });
  // Mirror onto the underlying Conversation for consistency with the rest of
  // the platform's transcript-locking conventions.
  await prisma.conversation.update({
    where: { id: finalSession.conversationId },
    data: { endedAt: now },
  });

  // Run the grader. We catch errors here so a grading failure doesn't poison
  // the student's End Session experience; we email the instructor instead.
  let aggregate: number | undefined;
  let gradeError: string | undefined;
  try {
    const result = await gradeFinalSession(sessionId);
    if (result.ok) {
      aggregate = result.aggregate;
    } else {
      gradeError = result.error;
    }
  } catch (err) {
    gradeError = err instanceof Error ? err.message : String(err);
  }

  if (gradeError) {
    void sendInstructorAlert(
      "Final 558 grading failed",
      `Final session ${sessionId} ended successfully but grading failed.\nError: ${gradeError}\n\nThe transcript is intact; you can re-run grading from the instructor dashboard.`,
      {
        category: "grading_error",
        studentEmail: authSession.user.email || undefined,
        conversationId: finalSession.conversationId,
      }
    );
  }

  return Response.json({
    ok: true,
    sessionId,
    aggregate: aggregate ?? null,
    gradeError: gradeError ?? null,
  });
}
