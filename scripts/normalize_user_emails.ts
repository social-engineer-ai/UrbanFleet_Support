#!/usr/bin/env tsx
/**
 * One-shot: lowercase any User.email and OtpCode.email rows that contain
 * uppercase characters. Idempotent — already-lowercase rows are skipped.
 *
 * Run once after deploying the auth normalization fix so existing mixed-case
 * rows do not become unreachable from the (now-normalizing) login lookup.
 *
 * Usage: tsx scripts/normalize_user_emails.ts
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const usersToFix = await prisma.$queryRaw<Array<{ id: string; email: string }>>`
    SELECT id, email FROM User WHERE email != LOWER(email)
  `;

  console.log(`Found ${usersToFix.length} mixed-case User row(s).`);

  let fixed = 0;
  let skipped = 0;
  for (const u of usersToFix) {
    const target = u.email.toLowerCase();
    const collision = await prisma.user.findFirst({
      where: { email: target, NOT: { id: u.id } },
    });
    if (collision) {
      console.error(`SKIP ${u.email} -> ${target}: a row with the lowercase email already exists (id=${collision.id}). Manual merge required.`);
      skipped++;
      continue;
    }
    await prisma.user.update({ where: { id: u.id }, data: { email: target } });
    console.log(`OK   ${u.email} -> ${target}`);
    fixed++;
  }

  const otpUpdated = await prisma.$executeRaw`UPDATE OtpCode SET email = LOWER(email) WHERE email != LOWER(email)`;
  console.log("");
  console.log(`Users:    ${fixed} updated, ${skipped} skipped.`);
  console.log(`OtpCode:  ${otpUpdated} row(s) updated.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
