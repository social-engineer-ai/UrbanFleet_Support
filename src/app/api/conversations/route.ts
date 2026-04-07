import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStudentState, getConversationSummaries } from "@/lib/agents/state";
import { buildClientSystemPrompt, getClientInitialMessage } from "@/lib/agents/client";
import { buildMentorSystemPrompt, getMentorInitialMessage } from "@/lib/agents/mentor";

const CONVERSATION_MESSAGE_LIMIT = 200;

// GET: List conversations for the current user
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const conversations = await prisma.conversation.findMany({
    where: { userId: session.user.id },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      agentType: true,
      persona: true,
      startedAt: true,
      endedAt: true,
      summary: true,
      messageCount: true,
    },
  });

  return Response.json(conversations);
}

// POST: Start or resume a conversation with a persona
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { agentType, persona } = await req.json();

  if (!agentType || !["client", "mentor"].includes(agentType)) {
    return Response.json({ error: "Invalid agent type" }, { status: 400 });
  }

  if (agentType === "client" && !["elena", "marcus", "priya", "james"].includes(persona)) {
    return Response.json({ error: "Invalid persona" }, { status: 400 });
  }

  const resolvedPersona = agentType === "mentor" ? "mentor" : persona;

  // Check for an existing active (un-ended) conversation with this persona
  const existingConversation = await prisma.conversation.findFirst({
    where: {
      userId: session.user.id,
      agentType,
      persona: resolvedPersona,
      endedAt: null,
    },
    orderBy: { startedAt: "desc" },
  });

  if (existingConversation) {
    // If under the message limit, resume it
    if (existingConversation.messageCount < CONVERSATION_MESSAGE_LIMIT) {
      return Response.json({
        conversationId: existingConversation.id,
        resumed: true,
        agentType,
        persona: resolvedPersona,
      });
    }

    // Over the limit — auto-end the old conversation and start fresh
    const messages = await prisma.message.findMany({
      where: { conversationId: existingConversation.id, role: { not: "system" } },
      orderBy: { timestamp: "asc" },
    });

    // Import dynamically to avoid circular dependency
    const { analyzeConversationAndUpdateState } = await import("@/lib/agents/state");
    const { summary } = await analyzeConversationAndUpdateState(
      session.user.id,
      agentType,
      resolvedPersona,
      messages.map((m) => ({ role: m.role, content: m.content }))
    );

    await prisma.conversation.update({
      where: { id: existingConversation.id },
      data: { endedAt: new Date(), summary },
    });
  }

  // Create a new conversation
  const studentState = await getStudentState(session.user.id);

  // Increment meeting/session count NOW (optimistic) so progressive disclosure works
  if (agentType === "client") {
    studentState.conversation_scores.total_meetings += 1;
  } else {
    studentState.conversation_scores.total_sessions += 1;
  }
  const { updateStudentState } = await import("@/lib/agents/state");
  await updateStudentState(session.user.id, studentState);

  const summaries = await getConversationSummaries(session.user.id);

  let initialMessage: string;
  if (agentType === "client") {
    initialMessage = getClientInitialMessage(
      persona,
      studentState.conversation_scores.total_meetings
    );
  } else {
    initialMessage = getMentorInitialMessage(
      studentState.conversation_scores.total_sessions,
      studentState
    );
  }

  let systemPrompt: string;
  if (agentType === "client") {
    systemPrompt = buildClientSystemPrompt(persona, studentState, summaries);
  } else {
    systemPrompt = buildMentorSystemPrompt(studentState, summaries);
  }

  const conversation = await prisma.conversation.create({
    data: {
      userId: session.user.id,
      agentType,
      persona: resolvedPersona,
      messageCount: 1,
    },
  });

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: "system",
      content: systemPrompt,
    },
  });

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: "assistant",
      content: initialMessage,
    },
  });

  return Response.json({
    conversationId: conversation.id,
    initialMessage,
    resumed: false,
    agentType,
    persona: resolvedPersona,
  });
}
