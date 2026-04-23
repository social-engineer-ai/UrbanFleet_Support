import { prisma } from "../prisma";
import { analyzeConversationAndUpdateState } from "../agents/state";
import { gradeAndUpdateConversation } from "../grading/engine";

export interface EndOptions {
  // When the conversation should be marked as ended. Defaults to `new Date()`.
  // Backfill / idle-end should pass the last-message timestamp so endedAt
  // reflects when the student actually stopped talking, not when the sweeper ran.
  endedAt?: Date;
  // If true, errors from gradeAndUpdateConversation are caught and returned
  // in the result instead of thrown. Routes that want non-blocking UX can
  // also fire-and-forget this whole helper from the caller side.
  catchGradeErrors?: boolean;
}

export interface EndResult {
  ok: boolean;
  alreadyEnded: boolean;
  messageCount: number;
  summary: string;
  gradeError?: string;
}

/**
 * Analyze, grade, and mark a conversation as ended. Used by the interactive
 * End Session route, by the idle-end cron sweeper, and by end-on-resume in
 * POST /api/conversations. Single source of truth for "finishing" a chat.
 *
 * This function is idempotent: if the conversation is already ended, it
 * returns early with alreadyEnded=true and does not re-grade.
 */
export async function endConversation(
  userId: string,
  conversationId: string,
  opts: EndOptions = {}
): Promise<EndResult> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
  });

  if (!conversation) {
    return { ok: false, alreadyEnded: false, messageCount: 0, summary: "" };
  }

  if (conversation.endedAt) {
    return {
      ok: true,
      alreadyEnded: true,
      messageCount: conversation.messageCount,
      summary: conversation.summary ?? "",
    };
  }

  const messages = await prisma.message.findMany({
    where: { conversationId, role: { not: "system" } },
    orderBy: { timestamp: "asc" },
  });

  const { summary } = await analyzeConversationAndUpdateState(
    userId,
    conversation.agentType,
    conversation.persona,
    messages.map((m) => ({ role: m.role, content: m.content }))
  );

  let gradeError: string | undefined;
  try {
    await gradeAndUpdateConversation(
      userId,
      conversationId,
      conversation.agentType,
      conversation.persona
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (opts.catchGradeErrors) {
      gradeError = msg;
    } else {
      throw err;
    }
  }

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      endedAt: opts.endedAt ?? new Date(),
      summary,
    },
  });

  return {
    ok: true,
    alreadyEnded: false,
    messageCount: messages.length,
    summary,
    gradeError,
  };
}
