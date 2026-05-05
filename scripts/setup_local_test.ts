// Dev-only: seeds the local SQLite DB with two test students (one per
// course) and a configured Final558Settings row so the /final gate is
// passable without going through the admin UI. Idempotent. Do not run
// against production.

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const PASSWORD = "test1234";
const COHORT_PASSWORD = "letmein";

async function main() {
  const prisma = new PrismaClient();
  const hash = await bcrypt.hash(PASSWORD, 10);

  await prisma.user.upsert({
    where: { email: "local358@test.edu" },
    update: { password: hash, course: "358", role: "student", emailVerified: true },
    create: {
      email: "local358@test.edu",
      password: hash,
      name: "Local 358 Student",
      role: "student",
      course: "358",
      emailVerified: true,
    },
  });

  await prisma.user.upsert({
    where: { email: "local558@test.edu" },
    update: { password: hash, course: "558", role: "student", emailVerified: true },
    create: {
      email: "local558@test.edu",
      password: hash,
      name: "Local 558 Student",
      role: "student",
      course: "558",
      emailVerified: true,
    },
  });

  await prisma.user.update({
    where: { email: "test@illinois.edu" },
    data: { password: hash, emailVerified: true },
  }).catch(() => {});

  const cohortHash = await bcrypt.hash(COHORT_PASSWORD, 10);
  const now = new Date();
  const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  for (const course of ["558", "358"] as const) {
    await prisma.final558Settings.upsert({
      where: { course },
      update: {
        password: cohortHash,
        windowStart: now,
        windowEnd: end,
      },
      create: {
        course,
        password: cohortHash,
        windowStart: now,
        windowEnd: end,
        weights: JSON.stringify({ perCoveragePoint: 0.05, perCrossCutting: 0.0667 }),
      },
    });
  }

  console.log("Local test setup complete.");
  console.log(`  358 student:  local358@test.edu  /  ${PASSWORD}`);
  console.log(`  558 student:  local558@test.edu  /  ${PASSWORD}`);
  console.log(`  cohort password (both courses):    ${COHORT_PASSWORD}`);
  console.log(`  Final settings: 558 + 358, window now -> +24h`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
