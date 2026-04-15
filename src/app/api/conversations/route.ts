import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStudentState, getConversationSummaries } from "@/lib/agents/state";
import { buildClientSystemPrompt, getClientInitialMessage } from "@/lib/agents/client";
import { buildMentorSystemPrompt, getMentorInitialMessage } from "@/lib/agents/mentor";
import { computeClientCoverage, type MeetingType } from "@/lib/coverage";

const CONVERSATION_MESSAGE_LIMIT = 200;

const VALID_MEETING_TYPES: MeetingType[] = ["requirements", "solution", "features", "practice"];

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
      meetingType: true,
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

  const body = await req.json();
  const { agentType, persona } = body;
  const meetingType: MeetingType =
    agentType === "client" && VALID_MEETING_TYPES.includes(body.meetingType)
      ? body.meetingType
      : "requirements";

  if (!agentType || !["client", "mentor"].includes(agentType)) {
    return Response.json({ error: "Invalid agent type" }, { status: 400 });
  }

  if (agentType === "client" && !["elena", "marcus", "priya", "james"].includes(persona)) {
    return Response.json({ error: "Invalid persona" }, { status: 400 });
  }

  const resolvedPersona = agentType === "mentor" ? "mentor" : persona;

  // Gating: Part 2 (solution) requires at least one ended Part 1 (requirements)
  // conversation with this same persona. Part 3 (features) and practice are ungated.
  if (agentType === "client" && meetingType === "solution") {
    const hasRequirementsMeeting = await prisma.conversation.findFirst({
      where: {
        userId: session.user.id,
        agentType: "client",
        persona: resolvedPersona,
        meetingType: "requirements",
        endedAt: { not: null },
      },
    });
    if (!hasRequirementsMeeting) {
      return Response.json(
        {
          error: `Complete a Part 1 (Requirements) meeting with this stakeholder first. You need to understand what they need before you can present a solution.`,
        },
        { status: 403 }
      );
    }
  }

  // Check for an existing active (un-ended) conversation with this persona + meeting type
  const existingConversation = await prisma.conversation.findFirst({
    where: {
      userId: session.user.id,
      agentType,
      persona: resolvedPersona,
      meetingType: agentType === "client" ? meetingType : "requirements",
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
        meetingType: existingConversation.meetingType,
      });
    }

    // Over the limit — auto-end the old conversation and start fresh
    const messages = await prisma.message.findMany({
      where: { conversationId: existingConversation.id, role: { not: "system" } },
      orderBy: { timestamp: "asc" },
    });

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

  // Increment meeting/session counter (practice meetings don't affect grading-facing
  // counters but we still track them for progress display).
  if (agentType === "client" && meetingType !== "practice") {
    studentState.conversation_scores.total_meetings += 1;
  } else if (agentType === "mentor") {
    studentState.conversation_scores.total_sessions += 1;
  }
  const { updateStudentState } = await import("@/lib/agents/state");
  await updateStudentState(session.user.id, studentState);

  // Per-persona meeting number (for Client prompts that care about "is this meeting #1 or #2 with this persona")
  const perPersonaCount = agentType === "client"
    ? await prisma.conversation.count({
        where: {
          userId: session.user.id,
          agentType: "client",
          persona: resolvedPersona,
          meetingType,
        },
      })
    : 0;

  const summaries = await getConversationSummaries(session.user.id);

  let initialMessage: string;
  if (agentType === "client") {
    initialMessage = getClientInitialMessage(
      persona,
      perPersonaCount + 1,
      studentState.course,
      meetingType
    );
  } else {
    initialMessage = getMentorInitialMessage(
      studentState.conversation_scores.total_sessions,
      studentState
    );
  }

  let systemPrompt: string;
  if (agentType === "client") {
    systemPrompt = buildClientSystemPrompt(persona, studentState, summaries, meetingType, perPersonaCount + 1);
  } else {
    // Compute per-persona coverage for mentor so it can nudge students on gaps
    const coverage = await computeClientCoverage(session.user.id);
    systemPrompt = buildMentorSystemPrompt(studentState, summaries, coverage);
  }

  const conversation = await prisma.conversation.create({
    data: {
      userId: session.user.id,
      agentType,
      persona: resolvedPersona,
      meetingType: agentType === "client" ? meetingType : "requirements",
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
    meetingType: agentType === "client" ? meetingType : null,
  });
}

