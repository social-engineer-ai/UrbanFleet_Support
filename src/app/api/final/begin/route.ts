import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  checkFinalEntryPreconditions,
  hasValidFinalAuthCookie,
} from "@/lib/final558/auth";
import { buildElenaFirstOpener } from "@/lib/agents/final558";
import { buildRecallBundle, EMPTY_BUNDLE } from "@/lib/final558/recall";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const pre = await checkFinalEntryPreconditions(userId);
  if (!pre.ok) {
    return Response.json({ error: pre.error }, { status: 403 });
  }

  if (!(await hasValidFinalAuthCookie(userId))) {
    return Response.json({ error: "session_expired" }, { status: 401 });
  }

  // Already started? Re-use it (resume on refresh).
  const existing = await prisma.final558Session.findUnique({
    where: { userId },
  });
  if (existing) {
    return Response.json({
      sessionId: existing.id,
      conversationId: existing.conversationId,
      resumed: true,
    });
  }

  // Create the underlying Conversation row first so it has a stable id we can
  // foreign-key on. agentType=final558, persona starts at elena (the active
  // stakeholder); the persona field is updated as the router switches.
  const conversation = await prisma.conversation.create({
    data: {
      userId,
      agentType: "final558",
      persona: "elena",
      meetingType: "final",
      messageCount: 1, // counts the assistant opener we're about to write
    },
  });

  // Build per-stakeholder recall + interaction-depth flags from this
  // student's prior client conversations (mentor and practice excluded).
  // If summarization fails for any reason we fall back to EMPTY_BUNDLE so
  // the session still starts; recall is an enhancement, not a blocker.
  let recallBundle = EMPTY_BUNDLE;
  try {
    recallBundle = await buildRecallBundle(userId, conversation.id);
  } catch (err) {
    console.error("Recall bundle build failed; continuing without recall:", err);
  }

  // Elena's opener adapts to the student's overall interaction depth
  // (none / part1_only / full) and acknowledges Part 3 if completed.
  const elenaOpener = buildElenaFirstOpener({
    elenaDepth: recallBundle.elena.depth,
    didExtraWork: recallBundle.didExtraWork,
  });

  // Persist the opener as the first assistant message. The system prompt
  // is composed per-turn (Section 5 of the PRD), so we do NOT store a
  // static system message on the conversation — each call to the messages
  // route assembles a persona-specific prompt for the active stakeholder.
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: "assistant",
      content: elenaOpener,
      metadata: JSON.stringify({ stakeholder: "elena", kind: "first_opener" }),
    },
  });

  const now = new Date();
  const final558Session = await prisma.final558Session.create({
    data: {
      userId,
      conversationId: conversation.id,
      activeStakeholder: "elena",
      lastSpokeElena: now,
      recallBundle: JSON.stringify(recallBundle),
    },
  });

  return Response.json({
    sessionId: final558Session.id,
    conversationId: conversation.id,
    resumed: false,
  });
}
