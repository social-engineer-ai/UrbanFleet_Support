import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  buildPersonaSystemPrompt,
  buildRouterUserMessage,
  buildCoverageJudgeUserMessage,
  ROUTER_SYSTEM_PROMPT,
  buildHandoffOpener,
  buildCoverageJudgeSystemPrompt,
  FORCED_ENTRY_OPENERS,
  pickForcedEntry,
  STAKEHOLDER_INFO,
  type Final558Stakeholder,
  type SessionContext,
  type FinalCourse,
  FINAL_STAKEHOLDERS,
} from "@/lib/agents/final558";
import { parseRecallBundle } from "@/lib/final558/recall";
import { sendInstructorAlert } from "@/lib/email";

const anthropic = new Anthropic();

const PERSONA_MODEL = "claude-sonnet-4-6";
const ROUTER_MODEL = "claude-haiku-4-5-20251001";
const JUDGE_MODEL = "claude-haiku-4-5-20251001";

const ROUTER_HISTORY = 6; // recent messages passed to the router
const MAX_TOKENS_PERSONA = 600;

interface ParsedMetadata {
  stakeholder?: Final558Stakeholder;
  kind?: string;
}

function parseStakeholder(meta: string | null): Final558Stakeholder | undefined {
  if (!meta) return undefined;
  try {
    const obj = JSON.parse(meta) as ParsedMetadata;
    return obj.stakeholder;
  } catch {
    return undefined;
  }
}

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
  const { content } = (await req.json().catch(() => ({}))) as {
    content?: string;
  };
  if (!content || typeof content !== "string" || !content.trim()) {
    return Response.json({ error: "Message content required" }, { status: 400 });
  }

  const finalSession = await prisma.final558Session.findFirst({
    where: { id: sessionId, userId },
    include: {
      conversation: true,
      coverage: true,
    },
  });
  if (!finalSession) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }
  if (finalSession.endedAt || finalSession.lockedAt) {
    return Response.json({ error: "Session ended" }, { status: 400 });
  }

  // Server-authoritative timer check. Settings are per-course (558 or 358),
  // each row carrying its own cohort password, window, and timing limits.
  // We look up the user's course to find the right row.
  const studentUserRow = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, course: true },
  });
  const courseStr = studentUserRow?.course ?? "558";
  const course: "558" | "358" = courseStr === "358" ? "358" : "558";
  const settings = await prisma.final558Settings.findUnique({
    where: { course },
  });
  const hardCutoffSec = settings?.hardCutoffAt ?? 4200;
  const forcedEntrySec = settings?.forcedEntryAt ?? 1320;
  const elapsedSec =
    (Date.now() - finalSession.startedAt.getTime()) / 1000;
  if (elapsedSec >= hardCutoffSec) {
    return Response.json({ error: "time_up" }, { status: 410 });
  }
  const remainingSec = Math.max(0, hardCutoffSec - elapsedSec);

  const conversationId = finalSession.conversationId;

  // Save user message immediately so it's never lost.
  const trimmed = content.trim();
  await prisma.message.create({
    data: {
      conversationId,
      role: "user",
      content: trimmed,
    },
  });
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { messageCount: { increment: 1 } },
  });

  // Track typed character count for paste-ratio flagging. We treat ALL
  // characters in user messages as typed; the paste handler separately
  // reports paste-character counts via the events endpoint.
  await prisma.final558Session.update({
    where: { id: sessionId },
    data: { typedCharCount: { increment: trimmed.length } },
  });

  // ===== Coverage judge (cheap, runs in parallel with routing decision)
  // We grade against the CURRENT active stakeholder — that's who the
  // student was responding to. After routing we'll know the next speaker,
  // but coverage credit belongs to who they were just answering.
  //
  // C1 (business framing) and C2 (data description) are session-wide
  // truths, not per-stakeholder ones: a single substantive answer about
  // the business problem or the data shape applies to all four
  // stakeholders. When either is covered for the active stakeholder, we
  // propagate the credit to the other three so the student isn't asked to
  // re-establish the same context with each persona. C3 (infrastructure)
  // and C4 (solution mapped to concern) remain stakeholder-specific.
  const previousActive = finalSession.activeStakeholder as Final558Stakeholder;
  const coverageCovered = await runCoverageJudge(trimmed, previousActive, course);
  if (coverageCovered.length > 0) {
    for (const point of coverageCovered) {
      const stakeholdersToCredit: Final558Stakeholder[] =
        point === "C1" || point === "C2"
          ? [...FINAL_STAKEHOLDERS]
          : [previousActive];
      for (const stakeholder of stakeholdersToCredit) {
        try {
          await prisma.final558Coverage.create({
            data: {
              sessionId,
              stakeholder,
              point,
            },
          });
        } catch {
          // unique constraint: already covered, ignore
        }
      }
    }
  }

  // ===== Decide who speaks next ========================================
  // 1. Forced entry has priority over the LLM router.
  const silenceSeconds = computeSilenceSeconds(finalSession);
  const forcedAlready: Record<Final558Stakeholder, boolean> = {
    elena: finalSession.forcedElena,
    marcus: finalSession.forcedMarcus,
    priya: finalSession.forcedPriya,
    james: finalSession.forcedJames,
  };

  const recentMsgs = await prisma.message.findMany({
    where: { conversationId, role: { not: "system" } },
    orderBy: { timestamp: "desc" },
    take: ROUTER_HISTORY,
    select: { role: true, content: true, metadata: true },
  });
  recentMsgs.reverse();

  let next: Final558Stakeholder;
  let isForced = false;
  let routerRationale = "";

  // Build "ever spoken" up-front. Forced entry only fires on stakeholders
  // who have never had a turn — once Elena/Marcus/Priya/James have spoken
  // at all, the lean-in handoff openers are the right way to bring them
  // back in, not the "Sorry to cut in" forced-entry phrasing.
  const everSpoken = await computeEverSpoken(conversationId);

  // Cue-driven routing runs FIRST. The router judges who the student is
  // actually talking to right now. Forced-entry is the floor: it fires
  // only when the router itself reports the cue was ambiguous AND someone
  // is past the silence threshold. Priority: cue > silence/timer.
  const routerOutput = await runRouter({
    recentMessages: recentMsgs.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
      stakeholder: parseStakeholder(m.metadata),
    })),
    active: previousActive,
    silenceSeconds,
    forcedAlready,
    forcedEntryThresholdSeconds: forcedEntrySec,
  });

  if (routerOutput.ambiguous) {
    const forcedTarget = pickForcedEntry({
      recentMessages: recentMsgs.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
        stakeholder: parseStakeholder(m.metadata),
      })),
      active: previousActive,
      silenceSeconds,
      forcedAlready,
      forcedEntryThresholdSeconds: forcedEntrySec,
      everSpoken,
    });
    if (forcedTarget) {
      next = forcedTarget;
      isForced = true;
      routerRationale = `forced (router ambiguous): ${forcedTarget} silent ${silenceSeconds[forcedTarget]}s > ${forcedEntrySec}s threshold`;
    } else {
      next = routerOutput.next;
      routerRationale = routerOutput.rationale;
    }
  } else {
    next = routerOutput.next;
    routerRationale = routerOutput.rationale;
  }

  // Log the routing decision as an event (audit trail).
  await prisma.final558Event.create({
    data: {
      sessionId,
      type: isForced ? "forced_entry" : "router_route",
      payload: JSON.stringify({
        from: previousActive,
        to: next,
        rationale: routerRationale,
        silenceSeconds,
      }),
    },
  });

  // ===== Determine the kind of opener (if any) ========================
  // If the next stakeholder is the same as the active one, no opener.
  // If different and they have spoken before, the persona prompt itself
  // handles continuation (no explicit opener).
  // If different and forced, post the forced-entry opener.
  // If different and first time speaking, post the handoff opener.
  const stakeholderHasSpokenBefore = await stakeholderEverSpoken(
    conversationId,
    next
  );

  // Recall bundle drives the gap-aware opener variant. If the column is
  // null (pre-recall deploy or summarizer failure), parseRecallBundle
  // returns EMPTY_BUNDLE and openers fall back to the "none" depth.
  const recallBundle = parseRecallBundle(finalSession.recallBundle ?? null);

  let prependedOpener: string | null = null;
  if (next !== previousActive) {
    if (isForced) {
      prependedOpener = FORCED_ENTRY_OPENERS[next];
    } else if (!stakeholderHasSpokenBefore) {
      prependedOpener = buildHandoffOpener(next, recallBundle[next].depth);
    }
  }

  // ===== Build the persona system prompt and call Claude (streaming) ==
  const allMessages = await prisma.message.findMany({
    where: { conversationId, role: { not: "system" } },
    orderBy: { timestamp: "asc" },
    select: { role: true, content: true, metadata: true },
  });

  const myCoverageRows = finalSession.coverage.filter(
    (c) => c.stakeholder === next
  );
  const myCoverage = {
    C1: myCoverageRows.some((c) => c.point === "C1") || (next === previousActive && coverageCovered.includes("C1")),
    C2: myCoverageRows.some((c) => c.point === "C2") || (next === previousActive && coverageCovered.includes("C2")),
    C3: myCoverageRows.some((c) => c.point === "C3") || (next === previousActive && coverageCovered.includes("C3")),
    C4: myCoverageRows.some((c) => c.point === "C4") || (next === previousActive && coverageCovered.includes("C4")),
  };

  // We already computed everSpoken above for the forced-entry decision; reuse.
  const spokenBefore = everSpoken;

  const ctx: SessionContext = {
    studentName: studentUserRow?.name ?? "Student",
    activeStakeholder: next,
    spokenBefore,
    myCoverage,
    remainingSeconds: Math.floor(remainingSec),
    myRecallSummary: recallBundle[next].summary,
    myInteractionDepth: recallBundle[next].depth,
    course,
  };

  const systemPrompt = buildPersonaSystemPrompt(next, ctx);

  // Compose the messages we send to Claude. Each prior assistant turn is
  // prefixed with the speaker's name in brackets so the persona can read the
  // transcript and stay in its own role rather than thinking "I said that"
  // when reading another stakeholder's words. The current persona's own
  // prior turns get the same prefix; the system prompt instructs the model
  // not to include the prefix in its NEW response (we strip it defensively
  // on save below).
  const claudeMessages = allMessages.map((m) => {
    if (m.role === "assistant") {
      const sh = parseStakeholder(m.metadata);
      const speaker = sh ? STAKEHOLDER_INFO[sh].name : "Stakeholder";
      return {
        role: "assistant" as const,
        content: `[${speaker}]: ${m.content}`,
      };
    }
    return {
      role: "user" as const,
      content: m.content,
    };
  });

  if (prependedOpener) {
    // Insert the opener as a guidance instruction the model continues from.
    // We handle the actual user-visible posting of the opener below; here
    // we just nudge the model so its first sentence aligns.
    claudeMessages.push({
      role: "user",
      content: `[SYSTEM: You (${next}) are now taking over the conversation. Begin your response with this opener verbatim, then continue: "${prependedOpener}"]`,
    });
  }

  // Update active stakeholder and silence trackers BEFORE we stream so the
  // session row reflects the truth even if streaming fails.
  const now = new Date();
  await prisma.final558Session.update({
    where: { id: sessionId },
    data: {
      activeStakeholder: next,
      ...(isForced
        ? next === "elena"
          ? { forcedElena: true }
          : next === "marcus"
            ? { forcedMarcus: true }
            : next === "priya"
              ? { forcedPriya: true }
              : { forcedJames: true }
        : {}),
      ...(next === "elena"
        ? { lastSpokeElena: now }
        : next === "marcus"
          ? { lastSpokeMarcus: now }
          : next === "priya"
            ? { lastSpokePriya: now }
            : { lastSpokeJames: now }),
    },
  });

  // ===== Stream the persona response ===================================
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let fullResponse = "";
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

      // Send a one-shot meta event so the client can update the active
      // stakeholder badge before the text starts streaming.
      safeEnqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            meta: {
              stakeholder: next,
              forced: isForced,
              coverageCovered,
              coverageStakeholder: previousActive,
            },
          })}\n\n`
        )
      );

      try {
        const claudeStream = anthropic.messages.stream({
          model: PERSONA_MODEL,
          max_tokens: MAX_TOKENS_PERSONA,
          system: systemPrompt,
          messages: claudeMessages,
        });

        for await (const event of claudeStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            const text = event.delta.text;
            fullResponse += text;
            if (
              !safeEnqueue(
                encoder.encode(`data: ${JSON.stringify({ text })}\n\n`)
              )
            ) {
              break;
            }
          }
        }

        if (fullResponse.length > 0) {
          // Defensive: strip any leading "[Speaker Name]: " prefix the model
          // might echo back from the labeled-transcript context. The system
          // prompt tells it not to, but we don't trust unverified output.
          const prefixStripped = stripSpeakerPrefix(fullResponse, next);

          // Detect the [DONE] closure marker and mark this stakeholder
          // complete. The marker is invisible to students: we strip it
          // before persisting so it never shows up in transcripts.
          const { content: cleaned, completed } = stripDoneMarker(
            prefixStripped
          );

          let stakeholderJustCompleted = false;
          if (completed && !isStakeholderAlreadyCompleted(finalSession, next)) {
            stakeholderJustCompleted = true;
            await prisma.final558Session.update({
              where: { id: sessionId },
              data: completionUpdateFor(next),
            });
            await prisma.final558Event.create({
              data: {
                sessionId,
                type: "stakeholder_complete",
                payload: JSON.stringify({ stakeholder: next }),
              },
            });
          }

          await prisma.message.create({
            data: {
              conversationId,
              role: "assistant",
              content: cleaned,
              metadata: JSON.stringify({
                stakeholder: next,
                forced: isForced,
                completed: stakeholderJustCompleted || undefined,
              }),
            },
          });
          await prisma.conversation.update({
            where: { id: conversationId },
            data: { messageCount: { increment: 1 } },
          });

          if (stakeholderJustCompleted) {
            safeEnqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  meta: { completedStakeholder: next },
                })}\n\n`
              )
            );
          }
        }

        safeEnqueue(
          encoder.encode(
            `data: ${JSON.stringify({ done: true, remainingSeconds: Math.floor(remainingSec) })}\n\n`
          )
        );
        safeClose();
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        const isClientDisconnect =
          errMsg.includes("Controller is already closed") ||
          errMsg.toLowerCase().includes("aborted") ||
          (error instanceof Error && error.name === "AbortError");

        if (!isClientDisconnect) {
          console.error("Final 558 streaming error:", error);
          void sendInstructorAlert(
            "Final 558 streaming error",
            `A student hit an error mid-final-conversation. Their user message IS saved.\n\nSession: ${sessionId}\nStakeholder: ${next}\nError: ${errMsg}`,
            {
              category: "claude_api_error",
              studentEmail: authSession.user.email || undefined,
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

// === Helpers ===========================================================

function computeSilenceSeconds(s: {
  startedAt: Date;
  lastSpokeElena: Date | null;
  lastSpokeMarcus: Date | null;
  lastSpokePriya: Date | null;
  lastSpokeJames: Date | null;
}): Record<Final558Stakeholder, number> {
  const now = Date.now();
  const sec = (d: Date | null) =>
    Math.floor((now - (d ?? s.startedAt).getTime()) / 1000);
  return {
    elena: sec(s.lastSpokeElena),
    marcus: sec(s.lastSpokeMarcus),
    priya: sec(s.lastSpokePriya),
    james: sec(s.lastSpokeJames),
  };
}

// Strip the [DONE] closure marker the persona appends when ready to
// close their thread. Detection is deliberately permissive: the marker
// can appear on its own line, with optional whitespace, possibly
// wrapped in trailing punctuation. Returns the cleaned content plus a
// boolean indicating whether the marker was present.
function stripDoneMarker(text: string): { content: string; completed: boolean } {
  // Look for [DONE] anywhere near the end of the message, possibly on
  // its own line with surrounding whitespace.
  const re = /\s*\[DONE\]\s*$/i;
  if (re.test(text)) {
    return { content: text.replace(re, "").trimEnd(), completed: true };
  }
  // Defensive fallback: marker buried mid-message (shouldn't happen,
  // but tolerate). Strip wherever it is.
  const anywhere = /\s*\[DONE\]\s*/gi;
  if (anywhere.test(text)) {
    return { content: text.replace(anywhere, " ").replace(/\s{2,}/g, " ").trim(), completed: true };
  }
  return { content: text, completed: false };
}

function isStakeholderAlreadyCompleted(
  session: { completedElena: boolean; completedMarcus: boolean; completedPriya: boolean; completedJames: boolean },
  who: Final558Stakeholder
): boolean {
  switch (who) {
    case "elena":
      return session.completedElena;
    case "marcus":
      return session.completedMarcus;
    case "priya":
      return session.completedPriya;
    case "james":
      return session.completedJames;
  }
}

function completionUpdateFor(who: Final558Stakeholder): {
  completedElena?: boolean;
  completedMarcus?: boolean;
  completedPriya?: boolean;
  completedJames?: boolean;
} {
  switch (who) {
    case "elena":
      return { completedElena: true };
    case "marcus":
      return { completedMarcus: true };
    case "priya":
      return { completedPriya: true };
    case "james":
      return { completedJames: true };
  }
}

// Strip a leading "[Name]: " or "[Name Name]: " prefix from a response.
// The model is instructed not to add this, but if it does (echoing the
// labeled transcript convention) we remove it before persisting so the
// stored transcript stays clean.
function stripSpeakerPrefix(text: string, current: Final558Stakeholder): string {
  const trimmed = text.replace(/^\s*/, "");
  // Try the current speaker's full name first, then any of the four names,
  // then a permissive bracketed fallback.
  const names = FINAL_STAKEHOLDERS.map((s) => STAKEHOLDER_INFO[s].name);
  // Move current to front so the most-likely match is tried first.
  const ordered = [STAKEHOLDER_INFO[current].name, ...names.filter((n) => n !== STAKEHOLDER_INFO[current].name)];
  for (const name of ordered) {
    const re = new RegExp(`^\\[${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\]:\\s*`);
    if (re.test(trimmed)) return trimmed.replace(re, "");
  }
  // Fallback: any "[Anything]: " at the start
  const generic = /^\[[^\]\n]{1,40}\]:\s*/;
  if (generic.test(trimmed)) return trimmed.replace(generic, "");
  return text;
}

// Returns a map of stakeholder → has-spoken-at-all in this conversation.
// Used both by the forced-entry picker (to avoid re-forcing someone who
// already had their turn) and by the persona prompt (so handoff openers
// only fire on first appearances).
async function computeEverSpoken(
  conversationId: string
): Promise<Record<Final558Stakeholder, boolean>> {
  const result: Record<Final558Stakeholder, boolean> = {
    elena: false,
    marcus: false,
    priya: false,
    james: false,
  };
  const rows = await prisma.message.findMany({
    where: { conversationId, role: "assistant" },
    select: { metadata: true },
  });
  for (const m of rows) {
    const sh = parseStakeholder(m.metadata);
    if (sh) result[sh] = true;
  }
  return result;
}

async function stakeholderEverSpoken(
  conversationId: string,
  who: Final558Stakeholder
): Promise<boolean> {
  const m = await prisma.message.findFirst({
    where: {
      conversationId,
      role: "assistant",
      metadata: { contains: `"stakeholder":"${who}"` },
    },
    select: { id: true },
  });
  return !!m;
}

async function runRouter(input: {
  recentMessages: { role: "user" | "assistant"; content: string; stakeholder?: Final558Stakeholder }[];
  active: Final558Stakeholder;
  silenceSeconds: Record<Final558Stakeholder, number>;
  forcedAlready: Record<Final558Stakeholder, boolean>;
  forcedEntryThresholdSeconds: number;
}): Promise<{ next: Final558Stakeholder; ambiguous: boolean; rationale: string }> {
  const userMessage = buildRouterUserMessage(input);
  try {
    const res = await anthropic.messages.create({
      model: ROUTER_MODEL,
      max_tokens: 200,
      system: ROUTER_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });
    const text =
      res.content
        .filter((c) => c.type === "text")
        .map((c) => (c as { text: string }).text)
        .join("") ?? "";
    const parsed = parseFirstJson(text);
    if (
      parsed &&
      typeof parsed.next === "string" &&
      FINAL_STAKEHOLDERS.includes(parsed.next as Final558Stakeholder)
    ) {
      return {
        next: parsed.next as Final558Stakeholder,
        ambiguous: !!parsed.ambiguous,
        rationale: typeof parsed.rationale === "string" ? parsed.rationale : "",
      };
    }
  } catch (err) {
    console.error("Router LLM failed; defaulting to active:", err);
  }
  return { next: input.active, ambiguous: true, rationale: "router_fallback" };
}

async function runCoverageJudge(
  studentMessage: string,
  addressedTo: Final558Stakeholder,
  course: FinalCourse
): Promise<("C1" | "C2" | "C3" | "C4")[]> {
  // No word floor: the LLM judge decides substance per-message. Short
  // student answers can be substantive ("trim horizon", "parquet format
  // with partitions", "filter by vehicle id and day partition") — a
  // word-count gate was screening these out and starving the coverage
  // tracker. The judge knows to return [] for "yes" / "okay" / "I don't
  // know" type messages.

  try {
    const res = await anthropic.messages.create({
      model: JUDGE_MODEL,
      max_tokens: 150,
      system: buildCoverageJudgeSystemPrompt(course),
      messages: [
        {
          role: "user",
          content: buildCoverageJudgeUserMessage({
            studentMessage,
            addressedTo,
          }),
        },
      ],
    });
    const text =
      res.content
        .filter((c) => c.type === "text")
        .map((c) => (c as { text: string }).text)
        .join("") ?? "";
    const parsed = parseFirstJson(text);
    if (parsed && Array.isArray(parsed.covered)) {
      return parsed.covered.filter((p: unknown): p is "C1" | "C2" | "C3" | "C4" =>
        p === "C1" || p === "C2" || p === "C3" || p === "C4"
      );
    }
  } catch (err) {
    console.error("Coverage judge failed:", err);
  }
  return [];
}

function parseFirstJson(text: string): Record<string, unknown> | null {
  // Find the first `{` and try parsing from there. Models occasionally wrap
  // JSON in code fences; we tolerate that.
  const start = text.indexOf("{");
  if (start < 0) return null;
  // Find the matching closing brace by scanning depth.
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

// GET: fetch session state for the live UI (timer, coverage, active, end state).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: sessionId } = await params;

  const finalSession = await prisma.final558Session.findFirst({
    where: { id: sessionId, userId: authSession.user.id },
    include: {
      coverage: true,
      conversation: {
        include: {
          messages: {
            where: { role: { not: "system" } },
            orderBy: { timestamp: "asc" },
            select: {
              id: true,
              role: true,
              content: true,
              metadata: true,
              timestamp: true,
            },
          },
        },
      },
    },
  });
  if (!finalSession) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  const settings = await prisma.final558Settings.findUnique({
    where: { course: "558" },
  });
  const hardCutoffSec = settings?.hardCutoffAt ?? 4200;
  const elapsedSec = Math.floor(
    (Date.now() - finalSession.startedAt.getTime()) / 1000
  );
  const remainingSec = Math.max(0, hardCutoffSec - elapsedSec);

  const coverageMap: Record<Final558Stakeholder, Record<string, boolean>> = {
    elena: { C1: false, C2: false, C3: false, C4: false },
    marcus: { C1: false, C2: false, C3: false, C4: false },
    priya: { C1: false, C2: false, C3: false, C4: false },
    james: { C1: false, C2: false, C3: false, C4: false },
  };
  for (const c of finalSession.coverage) {
    coverageMap[c.stakeholder as Final558Stakeholder][c.point] = true;
  }

  return Response.json({
    sessionId: finalSession.id,
    startedAt: finalSession.startedAt.toISOString(),
    endedAt: finalSession.endedAt?.toISOString() ?? null,
    activeStakeholder: finalSession.activeStakeholder,
    elapsedSec,
    remainingSec,
    hardCutoffSec,
    coverage: coverageMap,
    completed: {
      elena: finalSession.completedElena,
      marcus: finalSession.completedMarcus,
      priya: finalSession.completedPriya,
      james: finalSession.completedJames,
    },
    messages: finalSession.conversation.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      stakeholder: parseStakeholder(m.metadata),
      timestamp: m.timestamp.toISOString(),
    })),
  });
}
