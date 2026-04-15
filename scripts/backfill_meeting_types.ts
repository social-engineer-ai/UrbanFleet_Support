// One-off script to re-grade existing Conversations under the new
// meeting-type-aware rubric. Safe to run multiple times — uses Math.max
// semantics so re-grading can only uplift scores, never erase effort.
//
// The prisma migration already sets meetingType = "requirements" for all
// pre-existing rows via the default clause, so no DB writes are needed here
// for that — we just re-run the grading engine for each ended conversation.
//
// Usage (from /opt/stakeholdersim on prod):
//   npx tsx scripts/backfill_meeting_types.ts

import { prisma } from "../src/lib/prisma";
import { gradeAndUpdateConversation } from "../src/lib/grading/engine";

async function main() {
  console.log("=== Backfill meeting types + re-grade existing conversations ===\n");

  // 1. Confirm existing rows have a meetingType (migration should have handled this)
  const total = await prisma.conversation.count();
  const withoutType = await prisma.conversation.count({
    where: { meetingType: "" },
  });
  console.log(`Total conversations: ${total}`);
  console.log(`Conversations without meetingType: ${withoutType} (should be 0)\n`);

  // 2. Collect all ended conversations that have enough messages to grade
  const ended = await prisma.conversation.findMany({
    where: { endedAt: { not: null } },
    select: {
      id: true,
      userId: true,
      agentType: true,
      persona: true,
      meetingType: true,
      messageCount: true,
    },
    orderBy: { startedAt: "asc" },
  });

  console.log(`Found ${ended.length} ended conversations to re-grade.\n`);

  let graded = 0;
  let skipped = 0;
  let errors = 0;

  for (const conv of ended) {
    // Practice conversations are explicitly non-graded.
    if (conv.meetingType === "practice") {
      skipped += 1;
      continue;
    }

    // Conversations with too few messages won't produce useful grades.
    if (conv.messageCount < 4) {
      skipped += 1;
      continue;
    }

    try {
      const grades = await gradeAndUpdateConversation(
        conv.userId,
        conv.id,
        conv.agentType,
        conv.persona
      );
      if (grades.length > 0) {
        graded += 1;
        console.log(
          `  ✓ ${conv.id.slice(0, 8)} [${conv.agentType}/${conv.persona ?? "mentor"} ${conv.meetingType}] — ${grades.length} grade records (max semantics preserve prior scores)`
        );
      } else {
        skipped += 1;
      }
    } catch (err) {
      errors += 1;
      console.error(
        `  ✗ ${conv.id.slice(0, 8)} [${conv.agentType}/${conv.persona ?? "mentor"}] — error:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Graded: ${graded}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors: ${errors}`);
  console.log(`\nDone. Max semantics guarantee no student lost any previously-earned points.`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
