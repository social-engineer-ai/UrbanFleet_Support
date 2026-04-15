import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { analyzeConversationAndUpdateState } from "@/lib/agents/state";
import { gradeAndUpdateConversation } from "@/lib/grading/engine";
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

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId: session.user.id },
  });

  if (!conversation) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  if (conversation.endedAt) {
    return Response.json({ error: "Already ended" }, { status: 400 });
  }

  // Get all messages for analysis
  const messages = await prisma.message.findMany({
    where: { conversationId, role: { not: "system" } },
    orderBy: { timestamp: "asc" },
  });

  // Analyze conversation and update student state
  const { summary } = await analyzeConversationAndUpdateState(
    session.user.id,
    conversation.agentType,
    conversation.persona,
    messages.map((m) => ({ role: m.role, content: m.content }))
  );

  // Grade the conversation (runs in parallel-ish — doesn't block the response).
  // Grading failures are silent to the student but would skew final scores, so
  // alert the instructor so they can re-run grading manually if needed.
  gradeAndUpdateConversation(
    session.user.id,
    conversationId,
    conversation.agentType,
    conversation.persona
  ).catch((err) => {
    console.error("Grading error (non-blocking):", err);
    const errMsg = err instanceof Error ? err.message : String(err);
    void sendInstructorAlert(
      "Grading failed (non-blocking)",
      `A conversation ended successfully but the grading step failed. The conversation transcript is saved but no score was recorded — you may want to re-run grading for this conversation manually.\n\nAgent: ${conversation.agentType}${conversation.persona ? ` / ${conversation.persona}` : ""}\nError: ${errMsg}`,
      {
        category: "grading_error",
        studentEmail: session.user.email || undefined,
        conversationId,
      }
    );
  });

  // Mark conversation as ended
  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      endedAt: new Date(),
      summary,
    },
  });

  return Response.json({ summary, messageCount: messages.length });
}
