// End any open conversation whose most recent non-system message is older
// than --threshold-minutes (default 30). Used by:
//   1. A 5-minute cron (see scripts/install_idle_end_cron.sh) — routine
//      sweeper so students who close the tab still get credit.
//   2. A one-off historical backfill — run with a wider threshold (e.g. 60)
//      to clean up the backlog of conversations abandoned before this script
//      existed.
//
// The same "end" code path as /api/conversations/[id]/end is used via the
// shared lib/conversations/end.ts helper: analyze (updates requirements_uncovered,
// hint_log, architecture_decisions, build_progress) + grade + mark endedAt.
//
// Usage:
//   npx tsx scripts/end_idle_conversations.ts                  # default 30 min
//   npx tsx scripts/end_idle_conversations.ts --dry-run        # report only
//   npx tsx scripts/end_idle_conversations.ts --threshold-minutes=60
//   npx tsx scripts/end_idle_conversations.ts --limit=10       # cap per run
//
// Safe to run repeatedly — endConversation() is idempotent on already-ended rows.

import { prisma } from "../src/lib/prisma";
import { endConversation } from "../src/lib/conversations/end";

interface Args {
  thresholdMinutes: number;
  dryRun: boolean;
  limit: number | null;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { thresholdMinutes: 30, dryRun: false, limit: null };
  for (const a of argv.slice(2)) {
    if (a === "--dry-run") out.dryRun = true;
    else if (a.startsWith("--threshold-minutes=")) {
      out.thresholdMinutes = Number(a.split("=")[1]);
    } else if (a.startsWith("--limit=")) {
      out.limit = Number(a.split("=")[1]);
    } else {
      console.error(`Unknown arg: ${a}`);
      process.exit(2);
    }
  }
  if (!Number.isFinite(out.thresholdMinutes) || out.thresholdMinutes < 0) {
    console.error("--threshold-minutes must be a non-negative number");
    process.exit(2);
  }
  return out;
}

async function main() {
  const { thresholdMinutes, dryRun, limit } = parseArgs(process.argv);
  const cutoff = new Date(Date.now() - thresholdMinutes * 60 * 1000);

  console.log(
    `=== Idle-end sweep ===\n` +
      `  threshold: ${thresholdMinutes} min (messages older than ${cutoff.toISOString()})\n` +
      `  dry-run:   ${dryRun}\n` +
      `  limit:     ${limit ?? "none"}`
  );

  // Collect all candidate open conversations. We filter in memory so we can
  // look at the timestamp of the LAST non-system message, which isn't trivial
  // to express in a single Prisma query without a groupBy.
  const openConvs = await prisma.conversation.findMany({
    where: { endedAt: null },
    select: {
      id: true,
      userId: true,
      agentType: true,
      persona: true,
      meetingType: true,
      messageCount: true,
      startedAt: true,
    },
  });

  console.log(`  candidates: ${openConvs.length} open conversations\n`);

  let stale = 0;
  let ended = 0;
  let alreadyEnded = 0;
  let skippedNoMessages = 0;
  let skippedTooNew = 0;
  let errors = 0;
  let gradeErrors = 0;

  for (const c of openConvs) {
    if (limit !== null && ended >= limit) break;

    const lastMsg = await prisma.message.findFirst({
      where: { conversationId: c.id, role: { not: "system" } },
      orderBy: { timestamp: "desc" },
      select: { timestamp: true },
    });

    // No student-visible messages — use startedAt as the fallback reference.
    // These are "opened but never spoken to" sessions; they should still be
    // closed out so the student's session list doesn't fill with ghosts.
    const lastActivity = lastMsg?.timestamp ?? c.startedAt;

    if (lastActivity > cutoff) {
      skippedTooNew += 1;
      continue;
    }

    stale += 1;

    const tag = `${c.id.slice(0, 8)} [${c.agentType}/${c.persona ?? "mentor"} ${c.meetingType}] msgs=${c.messageCount} last=${lastActivity.toISOString()}`;

    if (!lastMsg) {
      // 0 non-system messages. Nothing to analyze — just mark ended so the
      // conversation leaves the "open" pool.
      if (dryRun) {
        console.log(`  [dry] would close empty: ${tag}`);
        continue;
      }
      try {
        await prisma.conversation.update({
          where: { id: c.id },
          data: { endedAt: c.startedAt },
        });
        skippedNoMessages += 1;
        console.log(`  ○ closed empty: ${tag}`);
      } catch (err) {
        errors += 1;
        console.error(`  ✗ error closing empty ${tag}:`, err instanceof Error ? err.message : err);
      }
      continue;
    }

    if (dryRun) {
      console.log(`  [dry] would end: ${tag}`);
      continue;
    }

    try {
      const result = await endConversation(c.userId, c.id, {
        endedAt: lastActivity,
        catchGradeErrors: true,
      });
      if (result.alreadyEnded) {
        alreadyEnded += 1;
      } else if (result.ok) {
        ended += 1;
        if (result.gradeError) {
          gradeErrors += 1;
          console.log(`  ! ended (grade failed: ${result.gradeError}): ${tag}`);
        } else {
          console.log(`  ✓ ended: ${tag}`);
        }
      } else {
        errors += 1;
        console.error(`  ✗ endConversation returned not-ok: ${tag}`);
      }
    } catch (err) {
      errors += 1;
      console.error(`  ✗ error ending ${tag}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(
    `\n=== Summary ===\n` +
      `  stale candidates:       ${stale}\n` +
      `  ended (analyzed+graded): ${ended}\n` +
      `  empty (closed w/o analyze): ${skippedNoMessages}\n` +
      `  already ended (skipped): ${alreadyEnded}\n` +
      `  too new (skipped):      ${skippedTooNew}\n` +
      `  grade errors:           ${gradeErrors}\n` +
      `  errors:                 ${errors}`
  );

  await prisma.$disconnect();
  process.exit(errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
