import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const instructorPassword = await bcrypt.hash("admin2026!", 10);
  const taPassword = await bcrypt.hash("ta2026!", 10);

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

  console.log("Seeded instructor and TA accounts");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
