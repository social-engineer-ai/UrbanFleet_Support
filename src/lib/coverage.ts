import { prisma } from "./prisma";

export type PersonaId = "elena" | "marcus" | "priya" | "james";
export const CLIENT_PERSONAS: readonly PersonaId[] = ["elena", "marcus", "priya", "james"] as const;

export type MeetingType = "requirements" | "solution" | "features" | "practice";

export interface PersonaCoverage {
  requirements: number;
  solution: number;
  features: number;
  practice: number;
}

export type ClientCoverage = Record<PersonaId, PersonaCoverage>;

// Compute per-persona per-meeting-type coverage for a student. Only counts
// ENDED conversations — an in-progress meeting doesn't count toward "completed."
// Used by the Mentor prompt to surface gaps, the progress dashboard to render
// bars, and the chat welcome screen to gate the Part 2 button.
export async function computeClientCoverage(userId: string): Promise<ClientCoverage> {
  const rows = await prisma.conversation.groupBy({
    by: ["persona", "meetingType"],
    where: {
      userId,
      agentType: "client",
      endedAt: { not: null },
    },
    _count: { _all: true },
  });

  const coverage: ClientCoverage = {
    elena: { requirements: 0, solution: 0, features: 0, practice: 0 },
    marcus: { requirements: 0, solution: 0, features: 0, practice: 0 },
    priya: { requirements: 0, solution: 0, features: 0, practice: 0 },
    james: { requirements: 0, solution: 0, features: 0, practice: 0 },
  };

  for (const row of rows) {
    if (!row.persona) continue;
    const persona = row.persona as PersonaId;
    if (!(persona in coverage)) continue;
    const mt = row.meetingType as MeetingType;
    if (mt in coverage[persona]) {
      coverage[persona][mt] = row._count._all;
    }
  }

  return coverage;
}

// Convenience summaries for UI and prompts.
export function coverageTotals(coverage: ClientCoverage) {
  let requirements = 0;
  let solution = 0;
  let features = 0;
  for (const p of CLIENT_PERSONAS) {
    if (coverage[p].requirements > 0) requirements += 1;
    if (coverage[p].solution > 0) solution += 1;
    if (coverage[p].features > 0) features += 1;
  }
  return {
    requirements_done: requirements, // 0..4 — number of personas with at least one ended Part 1
    solution_done: solution,          // 0..4 — number of personas with at least one ended Part 2
    features_done: features,          // 0..4 — number of personas with at least one features proposal
  };
}
