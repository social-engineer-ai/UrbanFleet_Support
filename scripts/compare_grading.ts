// Take local358's most recent finished session and grade the SAME
// transcript twice: once with 358 calibration, once with 558. No DB
// writes. Prints the two GraderOutput JSONs and aggregates side by
// side so the calibration gap is visible.

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import Anthropic from "@anthropic-ai/sdk";
import {
  buildGraderSystemPrompt,
  computeAggregate,
  DEFAULT_WEIGHTS,
  STAKEHOLDER_INFO,
  FINAL_STAKEHOLDERS,
  type GraderOutput,
  type Final558Stakeholder,
} from "../src/lib/agents/final558";

const anthropic = new Anthropic();
const GRADER_MODEL = "claude-opus-4-7";
const GRADER_MAX_TOKENS = 3000;

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

async function gradeOnce(
  course: "358" | "558",
  userMessage: string
): Promise<GraderOutput | null> {
  const res = await anthropic.messages.create({
    model: GRADER_MODEL,
    max_tokens: GRADER_MAX_TOKENS,
    system: buildGraderSystemPrompt(course),
    messages: [{ role: "user", content: userMessage }],
  });
  const text = res.content
    .filter((c) => c.type === "text")
    .map((c) => (c as { text: string }).text)
    .join("");
  const json = parseFirstJson(text);
  return (json as unknown as GraderOutput) ?? null;
}

async function main() {
  const prisma = new PrismaClient();

  const user = await prisma.user.findUnique({
    where: { email: "local358@test.edu" },
  });
  if (!user) throw new Error("local358 not found");

  const session = await prisma.final558Session.findFirst({
    where: { userId: user.id, endedAt: { not: null } },
    orderBy: { startedAt: "desc" },
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
    },
  });
  if (!session) throw new Error("No ended local358 session found");

  console.log(
    `Session ${session.id}, ${session.conversation.messages.length} messages, ${session.coverage.length} coverage rows.`
  );

  const transcriptLines: string[] = [];
  for (const m of session.conversation.messages) {
    if (m.role === "user") {
      transcriptLines.push(`STUDENT: ${m.content}`);
    } else {
      let stakeholder: Final558Stakeholder | undefined;
      if (m.metadata) {
        try {
          stakeholder = (JSON.parse(m.metadata) as { stakeholder?: Final558Stakeholder })
            .stakeholder;
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

  const coverageByStakeholder: Record<string, string[]> = {};
  for (const c of session.coverage) {
    coverageByStakeholder[c.stakeholder] = coverageByStakeholder[c.stakeholder] ?? [];
    coverageByStakeholder[c.stakeholder].push(c.point);
  }
  const coverageSummary = FINAL_STAKEHOLDERS.map((s) => {
    const pts = coverageByStakeholder[s] ?? [];
    return `${STAKEHOLDER_INFO[s].name}: ${pts.length ? pts.sort().join(", ") : "(none)"}`;
  }).join("\n");

  const userMessage = `<transcript>
${transcript}
</transcript>

<coverage>
${coverageSummary}
</coverage>

<auto_flags>
No auto-flags.
</auto_flags>

Output the grading JSON now.`;

  console.log("\nGrading under 358 calibration...");
  const g358 = await gradeOnce("358", userMessage);
  console.log("Grading under 558 calibration...");
  const g558 = await gradeOnce("558", userMessage);

  if (!g358 || !g558) {
    console.error("Grader returned null for one or both runs");
    await prisma.$disconnect();
    return;
  }

  const a358 = computeAggregate(g358);
  const a558 = computeAggregate(g558);

  console.log("\n=== AGGREGATE (0-50 scale) ===");
  console.log(`  358 lenient: ${a358.toFixed(2)} / 50`);
  console.log(`  558 default: ${a558.toFixed(2)} / 50`);
  console.log(`  Gap:         ${(a358 - a558).toFixed(2)} points (${(((a358 - a558) / a358) * 100).toFixed(0)}% lower on 558)`);

  console.log("\n=== PER-CELL DELTA (358 - 558) ===");
  console.log("Stakeholder    C1     C2     C3     C4");
  for (const s of FINAL_STAKEHOLDERS) {
    const row = ["C1", "C2", "C3", "C4"].map((p) => {
      const v358 = (g358[s] as unknown as Record<string, number>)[p];
      const v558 = (g558[s] as unknown as Record<string, number>)[p];
      return `${v358}/${v558}`;
    });
    console.log(`  ${s.padEnd(8)} ${row.map((x) => x.padEnd(6)).join(" ")}`);
  }
  console.log("Cross-cutting  D1     D2     D3");
  const cross = ["D1", "D2", "D3"].map((d) => {
    const v358 = (g358.cross_cutting as Record<string, number | string>)[d] as number;
    const v558 = (g558.cross_cutting as Record<string, number | string>)[d] as number;
    return `${v358}/${v558}`;
  });
  console.log(`  (358/558)  ${cross.map((x) => x.padEnd(6)).join(" ")}`);

  console.log("\n=== 358 GRADER NOTES ===");
  console.log(g358.overall_notes);
  console.log("\n=== 558 GRADER NOTES ===");
  console.log(g558.overall_notes);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
