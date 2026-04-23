import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { endConversation } from "@/lib/conversations/end";
import { sendInstructorAlert } from "@/lib/email";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: conversationId } = await params;

  // Analyze + grade + mark-ended via the shared helper. We pass
  // catchGradeErrors so a grading failure doesn't poison the student's
  // "End Session" click; we alert the instructor instead.
  const result = await endConversation(session.user.id, conversationId, {
    catchGradeErrors: true,
  });

  if (!result.ok) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  if (result.alreadyEnded) {
    return Response.json({ error: "Already ended" }, { status: 400 });
  }

  if (result.gradeError) {
    void sendInstructorAlert(
      "Grading failed (non-blocking)",
      `A conversation ended successfully but the grading step failed. The conversation transcript is saved but no score was recorded — you may want to re-run grading for this conversation manually.\n\nError: ${result.gradeError}`,
      {
        category: "grading_error",
        studentEmail: session.user.email || undefined,
        conversationId,
      }
    );
  }

  return Response.json({
    summary: result.summary,
    messageCount: result.messageCount,
  });
}
