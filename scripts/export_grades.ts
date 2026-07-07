// Export final grades as CSV for Excel import. One row per session,
// sorted by course then email.

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

function csv(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function main() {
  const prisma = new PrismaClient();
  const sessions = await prisma.final558Session.findMany({
    where: { score: { isNot: null } },
    include: {
      user: { select: { name: true, email: true, course: true } },
      score: true,
    },
    orderBy: [{ user: { course: "asc" } }, { user: { email: "asc" } }],
  });

  const headers = [
    "course",
    "name",
    "email",
    "aggregate (out of 50)",
    "originally_graded_aggregate",
    "instructor_reviewed",
    "review_type",
    "started_at_utc",
    "ended_at_utc",
    "duration_minutes",
    "flagged_for_review",
  ];
  const rows: string[] = [headers.join(",")];

  for (const s of sessions) {
    const sc = s.score!;

    // Determine the "originally graded" aggregate: recompute from rawJson
    // with no overrides so we can show alongside the final aggregate.
    let originalAgg: number | null = null;
    try {
      const raw = JSON.parse(sc.rawJson) as Record<string, unknown>;
      let total = 0;
      for (const sh of ["elena", "marcus", "priya", "james"]) {
        const stk = (raw[sh] ?? {}) as Record<string, number>;
        for (const pt of ["C1", "C2", "C3", "C4"]) {
          total += (stk[pt] ?? 0) * 0.05;
        }
      }
      const cc = (raw.cross_cutting ?? {}) as Record<string, number>;
      for (const d of ["D1", "D2", "D3"]) {
        total += (cc[d] ?? 0) * 0.0667;
      }
      originalAgg = Math.round(total * 10 * 100) / 100;
    } catch {
      /* leave as null */
    }

    let reviewType = "ai_only";
    if (sc.instructorEdit && sc.instructorEdit !== "{}") {
      try {
        const edit = JSON.parse(sc.instructorEdit) as Record<string, unknown>;
        reviewType = "manual_override" in edit ? "manual" : "benefit_of_doubt_floor";
      } catch {
        reviewType = "instructor_edited";
      }
    }

    const startedMs = s.startedAt.getTime();
    const endedMs = s.endedAt ? s.endedAt.getTime() : null;
    const durationMin = endedMs ? Math.round(((endedMs - startedMs) / 60000) * 10) / 10 : null;

    const row = [
      csv(s.user.course),
      csv(s.user.name),
      csv(s.user.email),
      csv(sc.aggregate),
      csv(originalAgg),
      csv(sc.reviewedAt ? sc.reviewedAt.toISOString() : ""),
      csv(reviewType),
      csv(s.startedAt.toISOString()),
      csv(s.endedAt ? s.endedAt.toISOString() : ""),
      csv(durationMin),
      csv(s.flaggedForReview ? "yes" : "no"),
    ];
    rows.push(row.join(","));
  }

  console.log(rows.join("\n"));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
