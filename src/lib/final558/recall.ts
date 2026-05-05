// Per-stakeholder recall pipeline.
//
// Built once when the student begins their final session. For each of the
// four stakeholders, we summarize THAT stakeholder's prior client-agent
// meetings with this specific student (mentor conversations excluded;
// practice meetings excluded). Output is injected into the persona prompt
// as "recalled memory" so the stakeholder can:
//   - flag inconsistencies between current pitch and prior position
//   - acknowledge the right depth of prior interaction in their opener
//   - avoid quoting the student verbatim
//
// We also derive per-stakeholder interaction_depth (none|part1_only|full)
// and a session-wide did_extra_work flag (any "features" meeting completed)
// for use by the gap-aware opener generator.

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import {
  FINAL_STAKEHOLDERS,
  STAKEHOLDER_INFO,
  type Final558Stakeholder,
} from "@/lib/agents/final558";

const anthropic = new Anthropic();
const RECALL_MODEL = "claude-haiku-4-5-20251001";

export type InteractionDepth = "none" | "part1_only" | "full";

export interface StakeholderRecall {
  summary: string;
  depth: InteractionDepth;
}

export interface RecallBundle {
  elena: StakeholderRecall;
  marcus: StakeholderRecall;
  priya: StakeholderRecall;
  james: StakeholderRecall;
  didExtraWork: boolean;
}

const EMPTY_RECALL: StakeholderRecall = {
  summary: "",
  depth: "none",
};

export const EMPTY_BUNDLE: RecallBundle = {
  elena: EMPTY_RECALL,
  marcus: EMPTY_RECALL,
  priya: EMPTY_RECALL,
  james: EMPTY_RECALL,
  didExtraWork: false,
};

interface PriorMeeting {
  meetingType: string; // requirements | solution | features | practice
  startedAt: Date;
  messages: { role: string; content: string }[];
}

// Pull every prior client-agent conversation for this student, grouped by
// stakeholder persona. Excludes:
//   - mentor agent conversations
//   - the final session's own conversation (passed as excludeConversationId)
//   - "practice" meetings (don't carry weight as prior position)
//   - conversations with no messages
async function loadPriorMeetingsByStakeholder(
  userId: string,
  excludeConversationId: string
): Promise<Record<Final558Stakeholder, PriorMeeting[]>> {
  const conversations = await prisma.conversation.findMany({
    where: {
      userId,
      agentType: "client",
      id: { not: excludeConversationId },
      meetingType: { not: "practice" },
      persona: { in: [...FINAL_STAKEHOLDERS] },
    },
    include: {
      messages: {
        where: { role: { not: "system" } },
        orderBy: { timestamp: "asc" },
        select: { role: true, content: true },
      },
    },
    orderBy: { startedAt: "asc" },
  });

  const grouped: Record<Final558Stakeholder, PriorMeeting[]> = {
    elena: [],
    marcus: [],
    priya: [],
    james: [],
  };
  for (const c of conversations) {
    if (!c.persona) continue;
    if (c.messages.length === 0) continue;
    const persona = c.persona as Final558Stakeholder;
    if (!FINAL_STAKEHOLDERS.includes(persona)) continue;
    grouped[persona].push({
      meetingType: c.meetingType,
      startedAt: c.startedAt,
      messages: c.messages,
    });
  }
  return grouped;
}

function deriveDepth(meetings: PriorMeeting[]): InteractionDepth {
  if (meetings.length === 0) return "none";
  const hasSolution = meetings.some((m) => m.meetingType === "solution");
  if (hasSolution) return "full";
  const hasRequirements = meetings.some((m) => m.meetingType === "requirements");
  if (hasRequirements) return "part1_only";
  return "none";
}

function formatTranscriptForSummarizer(meetings: PriorMeeting[]): string {
  return meetings
    .map((m, i) => {
      const header = `--- Meeting ${i + 1} (${m.meetingType}) ---`;
      const turns = m.messages
        .map((msg) => {
          const speaker = msg.role === "user" ? "STUDENT" : "STAKEHOLDER";
          return `${speaker}: ${msg.content}`;
        })
        .join("\n\n");
      return `${header}\n${turns}`;
    })
    .join("\n\n");
}

const SUMMARIZER_SYSTEM_PROMPT = `You build a stakeholder's recalled memory of a student from prior
meetings. The summary is injected into that stakeholder's system prompt
as "what I remember about this student". It must let the stakeholder
notice inconsistencies and connect threads, WITHOUT letting them feed
the student answers.

Hard rules:
- Do not include verbatim quotes from the student. Describe the SHAPE of
  positions, leanings, and trade-offs, not the words.
- Do not list specific service names the student mentioned unless naming
  them is essential to a position they took (e.g., "they leaned toward a
  serverless ingest path"). Prefer abstraction over jargon.
- Capture: what topics this stakeholder probed; the direction the student
  was leaning; trade-offs they articulated; anything unresolved or
  surprising.
- 3 to 5 sentences. No bullet points. Write in the stakeholder's
  perspective using "I" or "we" sparingly; mostly third-person about the
  student.
- If there are no meetings, output exactly: NO_PRIOR_MEETINGS

Do not include any preamble or trailing commentary. Output only the
summary text.`;

async function summarizeOne(
  stakeholder: Final558Stakeholder,
  meetings: PriorMeeting[]
): Promise<string> {
  if (meetings.length === 0) return "";

  const sh = STAKEHOLDER_INFO[stakeholder];
  const transcript = formatTranscriptForSummarizer(meetings);
  const userMessage = `Stakeholder: ${sh.name} (${sh.title})

Number of prior meetings with this student: ${meetings.length}.
Meeting types: ${meetings.map((m) => m.meetingType).join(", ")}.

Transcripts:

${transcript}

Write the recalled-memory summary now.`;

  try {
    const res = await anthropic.messages.create({
      model: RECALL_MODEL,
      max_tokens: 400,
      system: SUMMARIZER_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });
    const text =
      res.content
        .filter((c) => c.type === "text")
        .map((c) => (c as { text: string }).text)
        .join("")
        .trim() ?? "";
    if (text === "NO_PRIOR_MEETINGS" || text.length < 20) return "";
    return text;
  } catch (err) {
    console.error(`Recall summarizer failed for ${stakeholder}:`, err);
    return "";
  }
}

export async function buildRecallBundle(
  userId: string,
  finalConversationId: string
): Promise<RecallBundle> {
  const grouped = await loadPriorMeetingsByStakeholder(userId, finalConversationId);

  const didExtraWork = FINAL_STAKEHOLDERS.some((s) =>
    grouped[s].some((m) => m.meetingType === "features")
  );

  const summaries = await Promise.all(
    FINAL_STAKEHOLDERS.map(async (s) => ({
      stakeholder: s,
      summary: await summarizeOne(s, grouped[s]),
      depth: deriveDepth(grouped[s]),
    }))
  );

  const bundle: RecallBundle = { ...EMPTY_BUNDLE };
  for (const r of summaries) {
    bundle[r.stakeholder] = { summary: r.summary, depth: r.depth };
  }
  bundle.didExtraWork = didExtraWork;
  return bundle;
}

export function parseRecallBundle(json: string | null): RecallBundle {
  if (!json) return EMPTY_BUNDLE;
  try {
    const parsed = JSON.parse(json) as RecallBundle;
    if (!parsed.elena || !parsed.marcus || !parsed.priya || !parsed.james) {
      return EMPTY_BUNDLE;
    }
    return parsed;
  } catch {
    return EMPTY_BUNDLE;
  }
}
