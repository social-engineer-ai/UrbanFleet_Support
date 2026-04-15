// Project milestones surfaced to students in the dashboard, help page, and
// first-login popup. Update these dates when the semester changes.

export const DEADLINES = {
  part1: {
    label: "Part 1 — Requirements Gathering",
    due: "2026-04-26",
    description: "Complete requirements meetings (Part 1) with all four stakeholders.",
  },
  part2: {
    label: "Part 2 — Solution Demonstration",
    due: "2026-05-10",
    description: "After April 26, return to each stakeholder with what you've built. Deadline coincides with the full-platform delivery milestone.",
  },
  finalExam: {
    label: "Final Exam (separate platform)",
    due: "2026-05-04",
    description: "In-class final exam conducted on a separate platform. Details in Canvas.",
  },
  fullDelivery: {
    label: "Full platform working",
    due: "2026-05-10",
    description: "Streaming + event-driven + orchestration + analytics all working end-to-end.",
  },
} as const;

export function daysUntil(isoDate: string): number {
  const target = new Date(isoDate).getTime();
  const now = Date.now();
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}
