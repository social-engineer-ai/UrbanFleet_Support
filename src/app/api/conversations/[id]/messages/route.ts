import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { analyzeConversationAndUpdateState } from "@/lib/agents/state";
import { sendInstructorAlert } from "@/lib/email";

const anthropic = new Anthropic();

const MESSAGE_LIMIT = 200;
const WARNING_THRESHOLD = 180;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: conversationId } = await params;
  const { content } = await req.json();

  if (!content || typeof content !== "string") {
    return Response.json({ error: "Message content required" }, { status: 400 });
  }

  // Verify conversation belongs to user
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId: session.user.id },
  });

  if (!conversation) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  if (conversation.endedAt) {
    return Response.json({ error: "Conversation has ended" }, { status: 400 });
  }

  // Check message limit
  if (conversation.messageCount >= MESSAGE_LIMIT) {
    return Response.json({ error: "Message limit reached. Please start a new conversation." }, { status: 400 });
  }

  // Get all messages in this conversation
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { timestamp: "asc" },
  });

  // Extract system prompt and build message history for Claude
  const systemMessage = messages.find((m) => m.role === "system");
  const chatMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  // Add the new user message
  chatMessages.push({ role: "user", content });

  // Save user message to DB
  await prisma.message.create({
    data: {
      conversationId,
      role: "user",
      content,
    },
  });

  // Add message limit warning if approaching limit
  const remainingMessages = MESSAGE_LIMIT - conversation.messageCount - 1;
  let systemAddendum = "";
  if (remainingMessages <= MESSAGE_LIMIT - WARNING_THRESHOLD) {
    systemAddendum = `\n\n[SYSTEM NOTE: This student has ${remainingMessages} messages remaining in this session. If they have fewer than 5, gently remind them to wrap up key points.]`;
  }

  // Stream response from Claude
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let fullResponse = "";
      // Track controller state so catch-path operations don't throw
      // "Invalid state: Controller is already closed" when the browser
      // has dropped the SSE connection mid-stream.
      let streamClosed = false;

      const safeEnqueue = (data: Uint8Array) => {
        if (streamClosed) return false;
        try {
          controller.enqueue(data);
          return true;
        } catch {
          streamClosed = true;
          return false;
        }
      };

      const safeClose = () => {
        if (streamClosed) return;
        streamClosed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      try {
        const claudeStream = anthropic.messages.stream({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1500,
          system: (systemMessage?.content || "") + systemAddendum,
          messages: chatMessages,
        });

        for await (const event of claudeStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            const text = event.delta.text;
            fullResponse += text;
            if (!safeEnqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))) {
              // Client disconnected — stop streaming from Claude too, but
              // keep going to save whatever we have so far so the student's
              // work isn't lost.
              break;
            }
          }
        }

        // Save assistant response to DB (even if client disconnected, so the
        // partial response is preserved for when they come back).
        if (fullResponse.length > 0) {
          await prisma.message.create({
            data: {
              conversationId,
              role: "assistant",
              content: fullResponse,
            },
          });

          // Update message count only if we saved something
          await prisma.conversation.update({
            where: { id: conversationId },
            data: { messageCount: conversation.messageCount + 2 },
          });
        }

        // Send remaining messages info (no-op if already disconnected)
        safeEnqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              done: true,
              remainingMessages: remainingMessages - 1,
            })}\n\n`
          )
        );

        safeClose();
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);

        // A client disconnect (browser closed tab, network dropped) surfaces as
        // either "Controller is already closed" or an AbortError. Those are
        // routine — the student saw nothing because they weren't looking. Don't
        // page the instructor for these.
        const isClientDisconnect =
          errMsg.includes("Controller is already closed") ||
          errMsg.toLowerCase().includes("aborted") ||
          (error instanceof Error && error.name === "AbortError");

        if (isClientDisconnect) {
          console.log(
            `Client disconnected mid-stream (benign): ${conversation.agentType}/${conversation.persona ?? "mentor"} conv=${conversationId}`
          );
        } else {
          console.error("Claude streaming error:", error);
          void sendInstructorAlert(
            "Claude streaming error during student conversation",
            `A student hit an error mid-conversation. They saw "Failed to generate response"; the user message they sent IS saved, but the assistant reply was not generated.\n\nAgent: ${conversation.agentType}${conversation.persona ? ` / ${conversation.persona}` : ""}\nError: ${errMsg}\n\nLikely causes (in order of frequency):\n- Anthropic API outage or rate limit (check https://status.anthropic.com)\n- Context window exceeded (this conversation has ${conversation.messageCount} messages)\n- Model name deprecated (currently claude-sonnet-4-20250514 — check if still supported)\n- Invalid ANTHROPIC_API_KEY (check /opt/stakeholdersim/.env)\n\nNote: "Controller is already closed" and AbortError-type errors are benign client disconnects and are now suppressed from these alerts.`,
            {
              category: "claude_api_error",
              studentEmail: session.user.email || undefined,
              conversationId,
            }
          );
        }

        safeEnqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: "Failed to generate response" })}\n\n`
          )
        );
        safeClose();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// GET: Get all messages for a conversation
export async function GET(
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
    // Check if user is instructor/TA
    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user || !["instructor", "ta"].includes(user.role)) {
      return Response.json({ error: "Conversation not found" }, { status: 404 });
    }
  }

  const messages = await prisma.message.findMany({
    where: { conversationId, role: { not: "system" } },
    orderBy: { timestamp: "asc" },
    select: {
      id: true,
      role: true,
      content: true,
      metadata: true,
      timestamp: true,
    },
  });

  return Response.json(messages);
}
