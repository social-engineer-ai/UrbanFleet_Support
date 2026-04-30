// Grader for the BADM 558 in-class final.
//
// Runs once per session, immediately after end (student-initiated or hard
// cutoff). Reads the full transcript + coverage state + flag info, calls
// Opus, parses the JSON, computes the aggregate, writes Final558Score.

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../prisma";
import {
  GRADER_SYSTEM_PROMPT,
  computeAggregate,
  DEFAULT_WEIGHTS,
  STAKEHOLDER_INFO,
  type GraderOutput,
  type Final558Stakeholder,
  FINAL_STAKEHOLDERS,
} from "../agents/final558";

const anthropic = new Anthropic();
const GRADER_MODEL = "claude-opus-4-7";
const GRADER_MAX_TOKENS = 3000;

export async function gradeFinalSession(
  sessionId: string,
  opts: { force?: boolean } = {}
): Promise<{
  ok: boolean;
  aggregate?: number;
  error?: string;
}> {
  const session = await prisma.final558Session.findUnique({
    where: { id: sessionId },
    include: {
      conversation: {
        include: {
          messages: {
            where: { role: { not: "system" } },
            orderBy: { timestamp: "asc" },
          },
        },
      },
      coverage: true,
      score: true,
    },
  });
  if (!session) return { ok: false, error: "session_not_found" };

  // Idempotent: if a real AI grade already exists and we're not forcing a
  // re-grade, leave it alone. A "manual-only" score row (rawJson === "{}")
  // is treated as missing and will be re-graded.
  if (session.score && !opts.force && session.score.rawJson !== "{}") {
    return { ok: true, aggregate: session.score.aggregate };
  }
  // If we're replacing an existing score, preserve the instructor's
  // overrides — they're explicit human judgments and should survive a
  // re-grade.
  const preservedOverrides: string | null = session.score?.instructorEdit ?? null;
  const preservedReviewedBy: string | null = session.score?.reviewedBy ?? null;
  const preservedReviewedAt: Date | null = session.score?.reviewedAt ?? null;
  if (session.score) {
    await prisma.final558Score.delete({ where: { sessionId } });
  }

  const transcriptLines: string[] = [];
  for (const m of session.conversation.messages) {
    if (m.role === "user") {
      transcriptLines.push(`STUDENT: ${m.content}`);
    } else {
      let stakeholder: Final558Stakeholder | undefined;
      if (m.metadata) {
        try {
          const meta = JSON.parse(m.metadata) as { stakeholder?: Final558Stakeholder };
          stakeholder = meta.stakeholder;
        } catch {
          /* ignore */
        }
      }
      const label = stakeholder
        ? STAKEHOLDER_INFO[stakeholder].name.toUpperCase()
        : "STAKEHOLDER";
      transcriptLines.push(`${label}: ${m.content}`);
    }
  }
  const transcript = transcriptLines.join("\n\n");

  const coverageMap: Record<Final558Stakeholder, string[]> = {
    elena: [],
    marcus: [],
    priya: [],
    james: [],
  };
  for (const c of session.coverage) {
    if (c.stakeholder in coverageMap) {
      coverageMap[c.stakeholder as Final558Stakeholder].push(c.point);
    }
  }
  const coverageSummary = FINAL_STAKEHOLDERS.map((s) =>
    `${s}: ${coverageMap[s].length === 0 ? "(none)" : coverageMap[s].sort().join(", ")}`
  ).join("\n");

  const flagReasons = session.flagReasons
    ? (JSON.parse(session.flagReasons) as string[])
    : [];
  const flagSummary = session.flaggedForReview
    ? `Auto-flagged for instructor review. Reasons: ${flagReasons.join(", ")}. Paste chars: ${session.pasteCharCount}, typed chars: ${session.typedCharCount}, tab-hidden events: ${session.tabHiddenCount}, tab-hidden seconds: ${session.tabHiddenSeconds}.`
    : "No auto-flags.";

  const userMessage = `<transcript>
${transcript}
</transcript>

<coverage>
${coverageSummary}
</coverage>

<auto_flags>
${flagSummary}
</auto_flags>

Output the grading JSON now.`;

  let parsed: GraderOutput;
  try {
    const res = await anthropic.messages.create({
      model: GRADER_MODEL,
      max_tokens: GRADER_MAX_TOKENS,
      system: GRADER_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });
    const text = res.content
      .filter((c) => c.type === "text")
      .map((c) => (c as { text: string }).text)
      .join("");
    const json = parseFirstJson(text);
    if (!json) {
      return { ok: false, error: "grader_no_json" };
    }
    parsed = json as unknown as GraderOutput;
    if (!validateGraderOutput(parsed)) {
      return { ok: false, error: "grader_invalid_schema" };
    }
  } catch (err) {
    return {
      ok: false,
      error: `grader_call_failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Settings may override the default weights.
  const settings = await prisma.final558Settings.findUnique({
    where: { course: "558" },
  });
  let weights = DEFAULT_WEIGHTS;
  if (settings?.weights) {
    try {
      const parsedWeights = JSON.parse(settings.weights);
      if (
        typeof parsedWeights.perCoveragePoint === "number" &&
        typeof parsedWeights.perCrossCutting === "number"
      ) {
        weights = parsedWeights;
      }
    } catch {
      /* fall back to defaults */
    }
  }

  const overrideMap = preservedOverrides
    ? (JSON.parse(preservedOverrides) as Record<string, number>)
    : {};
  const aggregate = computeAggregate(parsed, weights, overrideMap);

  await prisma.final558Score.create({
    data: {
      sessionId,
      userId: session.userId,
      rawJson: JSON.stringify(parsed),
      aggregate,
      instructorEdit: preservedOverrides,
      reviewedBy: preservedReviewedBy,
      reviewedAt: preservedReviewedAt,
    },
  });

  return { ok: true, aggregate };
}

function parseFirstJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
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

function validateGraderOutput(obj: unknown): obj is GraderOutput {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  for (const s of FINAL_STAKEHOLDERS) {
    const sc = o[s] as Record<string, unknown> | undefined;
    if (!sc) return false;
    for (const p of ["C1", "C2", "C3", "C4"]) {
      if (typeof sc[p] !== "number") return false;
    }
    const notes = sc.notes as Record<string, unknown> | undefined;
    if (!notes) return false;
    for (const p of ["C1", "C2", "C3", "C4"]) {
      if (typeof notes[p] !== "string") return false;
    }
  }
  const cc = o.cross_cutting as Record<string, unknown> | undefined;
  if (!cc) return false;
  for (const d of ["D1", "D2", "D3"]) {
    if (typeof cc[d] !== "number") return false;
    if (typeof cc[`${d}_note`] !== "string") return false;
  }
  if (typeof o.overall_notes !== "string") return false;
  return true;
}
