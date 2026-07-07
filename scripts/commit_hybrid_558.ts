// Commit the hybrid soft-closure overrides for the 33 Tuesday 558
// sessions (excludes teststudent1 + the three Thursday students).
// Writes instructorEdit JSON + new aggregate + reviewedBy + reviewedAt.
// Preserves rawJson untouched.

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { PrismaClient } from "@prisma/client";

const FLOOR = 5;
const PER_COVERAGE = 0.05;
const PER_CROSS = 0.0667;
const STAKEHOLDERS = ["elena", "marcus", "priya", "james"] as const;
type SH = (typeof STAKEHOLDERS)[number];
const POINTS = ["C1", "C2", "C3", "C4"] as const;
const NAMES: Record<SH, string> = {
  elena: "Elena (VP Operations)",
  marcus: "Marcus (CFO)",
  priya: "Priya (CTO)",
  james: "James (Compliance)",
};
const EXCLUDE = new Set([
  "teststudent1@illinois.edu",
  "pl40@illinois.edu",
  "clin238@illinois.edu",
  "yashvi2@illinois.edu",
]);

const anthropic = new Anthropic();

const SOFT_SYSTEM = `You are auditing a final defense conversation. Given a stakeholder's last 1-2 messages, decide whether the stakeholder gave a SATISFACTION SIGNAL in their last turn or two. A satisfaction signal is acknowledgment language indicating they were satisfied with the most recent answer or felt the student covered enough on a topic. Examples of satisfaction signals: "Good, that's a real number", "That lands", "That's a good answer", "That helps me see it", "Okay, that is straight", "That's honest, I appreciate it", "Good, that's the layer I wanted", "That's the answer I needed", "I can defend that".

NOT a satisfaction signal: pure probing, redirects, asking for more specifics, brief acknowledgment that immediately leads to another question with no positive content (e.g., "Now walk me through..." with no preceding praise).

Output strict JSON: { "satisfied": true|false, "reason": "short rationale" }`;

interface SoftResult {
  satisfied: boolean;
  reason: string;
}

async function judgeSoft(stakeholder: SH, lastMessages: string[]): Promise<SoftResult> {
  const userMsg = `Stakeholder: ${NAMES[stakeholder]}

Their last ${lastMessages.length} message(s):

${lastMessages.map((m, i) => `[turn ${i + 1}]: ${m}`).join("\n\n")}

Did the stakeholder give a satisfaction signal in their last 1-2 turns?`;
  try {
    const res = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 100,
      system: SOFT_SYSTEM,
      messages: [{ role: "user", content: userMsg }],
    });
    const text = res.content
      .filter((c) => c.type === "text")
      .map((c) => (c as { text: string }).text)
      .join("");
    const m = text.match(/\{[\s\S]*?\}/);
    if (!m) return { satisfied: false, reason: "no_json" };
    return JSON.parse(m[0]) as SoftResult;
  } catch (e) {
    return { satisfied: false, reason: "error: " + (e instanceof Error ? e.message : String(e)) };
  }
}

async function main() {
  const prisma = new PrismaClient();
  const instructor = await prisma.user.findUnique({ where: { email: "ashishk@illinois.edu" } });
  if (!instructor) throw new Error("instructor not found");
  const reviewedAt = new Date();

  const sessions = await prisma.final558Session.findMany({
    where: { score: { isNot: null }, user: { course: "558" } },
    include: {
      user: { select: { email: true } },
      coverage: true,
      score: true,
      conversation: { include: { messages: { orderBy: { timestamp: "asc" } } } },
    },
  });
  const filtered = sessions.filter((s) => !EXCLUDE.has(s.user.email));

  let committed = 0;
  let unchanged = 0;
  let preserved = 0;

  for (const s of filtered) {
    let raw: Record<string, unknown> = {};
    try {
      raw = JSON.parse(s.score!.rawJson);
    } catch {
      /* ignore */
    }

    const sysClosed = {
      elena: s.completedElena,
      marcus: s.completedMarcus,
      priya: s.completedPriya,
      james: s.completedJames,
    };
    const cellsByStakeholder: Record<SH, Set<string>> = {
      elena: new Set(),
      marcus: new Set(),
      priya: new Set(),
      james: new Set(),
    };
    for (const c of s.coverage) {
      const sh = c.stakeholder as SH;
      if (cellsByStakeholder[sh]) cellsByStakeholder[sh].add(c.point);
    }

    const softClosed: Record<SH, boolean> = { elena: false, marcus: false, priya: false, james: false };
    for (const sh of STAKEHOLDERS) {
      if (sysClosed[sh]) continue;
      if (cellsByStakeholder[sh].size < 3) continue;
      const turns: string[] = [];
      for (const m of s.conversation.messages) {
        if (m.role !== "assistant") continue;
        let meta: { stakeholder?: string } = {};
        try {
          meta = JSON.parse(m.metadata || "{}");
        } catch {
          /* ignore */
        }
        if (meta.stakeholder === sh) turns.push(m.content);
      }
      if (turns.length === 0) continue;
      const last = turns.slice(-2);
      const r = await judgeSoft(sh, last);
      if (r.satisfied) softClosed[sh] = true;
    }

    const closed: Record<SH, boolean> = {
      elena: sysClosed.elena || softClosed.elena,
      marcus: sysClosed.marcus || softClosed.marcus,
      priya: sysClosed.priya || softClosed.priya,
      james: sysClosed.james || softClosed.james,
    };

    const effective = new Set<string>();
    for (const c of s.coverage) effective.add(c.stakeholder + "." + c.point);
    for (const sh of STAKEHOLDERS) if (closed[sh]) for (const pt of POINTS) effective.add(sh + "." + pt);

    const overrides: Record<string, number> = {};
    for (const cell of effective) {
      const [sh, pt] = cell.split(".");
      const stakeRow = raw[sh] as Record<string, number> | undefined;
      const rs = stakeRow?.[pt];
      if (typeof rs === "number" && rs < FLOOR) overrides[cell] = FLOOR;
    }
    if (effective.size >= 16) {
      const cc = (raw.cross_cutting ?? {}) as Record<string, number>;
      for (const d of ["D1", "D2", "D3"]) {
        const rs = cc[d];
        if (typeof rs === "number" && rs < FLOOR) overrides[d] = FLOOR;
      }
    }

    if (Object.keys(overrides).length === 0) {
      unchanged++;
      continue;
    }

    if (s.score!.instructorEdit && s.score!.instructorEdit !== "{}") {
      preserved++;
      continue;
    }

    let total = 0;
    for (const sh of STAKEHOLDERS) {
      const stakeRow = (raw[sh] ?? {}) as Record<string, number>;
      for (const pt of POINTS) {
        const k = sh + "." + pt;
        const v = k in overrides ? overrides[k] : (stakeRow[pt] ?? 0);
        total += v * PER_COVERAGE;
      }
    }
    const cc = (raw.cross_cutting ?? {}) as Record<string, number>;
    for (const d of ["D1", "D2", "D3"]) {
      const v = d in overrides ? overrides[d] : (cc[d] ?? 0);
      total += v * PER_CROSS;
    }
    let newAgg = Math.round(total * 10 * 100) / 100;
    if (newAgg > 50) newAgg = 50;

    await prisma.final558Score.update({
      where: { sessionId: s.id },
      data: {
        instructorEdit: JSON.stringify(overrides),
        aggregate: newAgg,
        reviewedBy: instructor.id,
        reviewedAt,
      },
    });
    committed++;
  }

  console.log("Committed:                                   " + committed);
  console.log("Unchanged (no overrides needed):             " + unchanged);
  console.log("Preserved (already had instructor override): " + preserved);
  console.log();

  const after = await prisma.final558Session.findMany({
    where: { user: { course: "558" }, score: { isNot: null } },
    include: { user: { select: { email: true } }, score: true },
  });
  const tuesdayAggs = after
    .filter((s) => !EXCLUDE.has(s.user.email))
    .map((s) => s.score!.aggregate)
    .sort((a, b) => a - b);
  console.log("Verification — Tuesday 558 distribution after commit:");
  console.log("  count:  " + tuesdayAggs.length);
  console.log("  mean:   " + (tuesdayAggs.reduce((a, b) => a + b, 0) / tuesdayAggs.length).toFixed(2));
  console.log("  median: " + tuesdayAggs[Math.floor(tuesdayAggs.length / 2)].toFixed(2));
  console.log("  min:    " + tuesdayAggs[0].toFixed(2));
  console.log("  max:    " + tuesdayAggs[tuesdayAggs.length - 1].toFixed(2));
  console.log("  at 50:  " + tuesdayAggs.filter((a) => a >= 50).length);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
