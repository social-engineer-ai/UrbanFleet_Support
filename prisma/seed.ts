import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Seed the instructor and TA accounts on first deploy. Uses upsert with
// `update: {}` so existing accounts (including rotated passwords) are
// preserved across re-deploys — the seeded password is only ever written
// on the initial insert. Passwords come from env vars so they're not
// hardcoded in git history; the fallbacks below exist only for dev and
// first-time bootstrap, and should be rotated via /forgot-password
// immediately after first login.
async function main() {
  const instructorPassword = await bcrypt.hash(
    process.env.INSTRUCTOR_SEED_PASSWORD || "change-me-after-first-login",
    10,
  );
  const taPassword = await bcrypt.hash(
    process.env.TA_SEED_PASSWORD || "change-me-after-first-login",
    10,
  );

  await prisma.user.upsert({
    where: { email: "ashishk@illinois.edu" },
    update: {},
    create: {
      email: "ashishk@illinois.edu",
      password: instructorPassword,
      name: "Ashish Khandelwal",
      role: "instructor",
      course: null,
      emailVerified: true,
    },
  });

  await prisma.user.upsert({
    where: { email: "jsamuel@illinois.edu" },
    update: {},
    create: {
      email: "jsamuel@illinois.edu",
      password: taPassword,
      name: "Jeremy Samuel",
      role: "ta",
      course: null,
      emailVerified: true,
    },
  });

  console.log("Seeded instructor and TA accounts (existing rows left unchanged)");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
