// Project milestones surfaced to students in the dashboard, help page, and
// first-login popup. Update these dates when the semester changes.
//
// `due` is the primary date (ISO) and is what short-date formatters parse.
// `dueLabel` is an optional override for cases where a single date can't
// express the deadline — e.g. the final presentation differs by section.

export interface Deadline {
  label: string;
  due: string;
  dueLabel?: string;
  description: string;
}

export const DEADLINES: Record<string, Deadline> = {
  part1: {
    label: "Part 1 — Requirements Gathering",
    due: "2026-04-26",
    dueLabel: "Apr 26",
    description: "Complete Part 1 (Requirements) meetings with all four stakeholders.",
  },
  part2: {
    label: "Part 2 — Solution Demonstration",
    due: "2026-05-04",
    dueLabel: "May 4",
    description: "Return to each stakeholder with what you've built.",
  },
  finalPresentation: {
    label: "Final Presentation + Full Platform Delivery",
    due: "2026-05-05",
    dueLabel: "May 5 / May 7",
    description:
      "In-class final presentation with a fully working platform. BADM 358 and BADM 558 Section E present on May 5. BADM 558 Section F presents on May 7. Your section determines your date.",
  },
};

export function daysUntil(isoDate: string): number {
  const target = new Date(isoDate).getTime();
  const now = Date.now();
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

// Short display string for any deadline — uses dueLabel if present,
// otherwise falls back to "MMM d" from the ISO date.
export function formatDeadlineShort(d: Deadline): string {
  if (d.dueLabel) return d.dueLabel;
  return new Date(d.due).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
