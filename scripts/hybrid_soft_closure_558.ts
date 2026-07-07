// One-shot dry-run: Tuesday 558 grading with hybrid soft-closure rule.
// Soft closure = stakeholder gave a satisfaction signal in their last
// 1-2 turns AND has 3+ of their 4 cells covered. Combines with
// system-flagged closure ([DONE]). Effective cells from any closure
// floor at 5; if effective cells reach 16, D1/D2/D3 also floor at 5.
// Excludes teststudent1 and the three Thursday students.

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

  interface Result {
    email: string;
    oldAgg: number;
    newAgg: number;
    cells: number;
    sys: number;
    soft: number;
    eff: number;
    softList: string[];
  }
  const results: Result[] = [];

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
    const softList: string[] = [];
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
      if (r.satisfied) {
        softClosed[sh] = true;
        softList.push(sh);
      }
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

    const sysCount = STAKEHOLDERS.filter((sh) => sysClosed[sh]).length;
    const softCount = STAKEHOLDERS.filter((sh) => softClosed[sh]).length;
    results.push({
      email: s.user.email,
      oldAgg: s.score!.aggregate,
      newAgg,
      cells: s.coverage.length,
      sys: sysCount,
      soft: softCount,
      eff: effective.size,
      softList,
    });
  }

  results.sort((a, b) => b.newAgg - a.newAgg);
  console.log("Email                                | Old   | New   | Cells | Sys | Soft | Eff   | Soft on");
  console.log("-------------------------------------+-------+-------+-------+-----+------+-------+--------");
  for (const r of results) {
    console.log(
      r.email.padEnd(36) +
        " | " +
        r.oldAgg.toFixed(2).padStart(5) +
        " | " +
        r.newAgg.toFixed(2).padStart(5) +
        " | " +
        (r.cells + "/16").padStart(5) +
        " | " +
        (r.sys + "/4").padStart(3) +
        " | " +
        (r.soft + "/4").padStart(4) +
        " | " +
        (r.eff + "/16").padStart(5) +
        " | " +
        r.softList.join(",")
    );
  }

  const aggs = results.map((r) => r.newAgg).sort((a, b) => a - b);
  const mean = aggs.reduce((a, b) => a + b, 0) / aggs.length;
  console.log();
  console.log("Distribution (Tuesday 558 hybrid soft-closure):");
  console.log("  count: " + aggs.length);
  console.log("  mean:  " + mean.toFixed(2));
  console.log("  median:" + aggs[Math.floor(aggs.length / 2)].toFixed(2));
  console.log("  min:   " + aggs[0].toFixed(2));
  console.log("  max:   " + aggs[aggs.length - 1].toFixed(2));
  const buckets: Record<string, number> = {
    "50.00": 0,
    "45-49.99": 0,
    "40-44.99": 0,
    "35-39.99": 0,
    "30-34.99": 0,
    "<30": 0,
  };
  for (const a of aggs) {
    if (a >= 50) buckets["50.00"]++;
    else if (a >= 45) buckets["45-49.99"]++;
    else if (a >= 40) buckets["40-44.99"]++;
    else if (a >= 35) buckets["35-39.99"]++;
    else if (a >= 30) buckets["30-34.99"]++;
    else buckets["<30"]++;
  }
  console.log();
  console.log("Histogram:");
  for (const [b, c] of Object.entries(buckets)) {
    console.log("  " + b.padEnd(10) + " | " + String(c).padStart(2) + " | " + "█".repeat(c));
  }
  console.log();
  console.log(results.filter((r) => r.soft > 0).length + " sessions had at least one new soft closure.");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
