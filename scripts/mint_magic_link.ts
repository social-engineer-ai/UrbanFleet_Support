// Mint a one-shot magic-link URL for a given user. Run on the server
// where NEXTAUTH_SECRET is set.
//
// Usage:
//   npx tsx scripts/mint_magic_link.ts <email> [base_url] [hours]
// Example:
//   npx tsx scripts/mint_magic_link.ts amk9@illinois.edu http://44.210.105.89 24

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

async function hmac(payload: string, secret: string): Promise<string> {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

async function main() {
  const email = process.argv[2];
  const baseUrl = process.argv[3] || "http://44.210.105.89";
  const hours = parseInt(process.argv[4] || "24", 10);

  if (!email) {
    console.error("Usage: npx tsx scripts/mint_magic_link.ts <email> [base_url] [hours]");
    process.exit(1);
  }

  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!secret) {
    console.error("NEXTAUTH_SECRET or AUTH_SECRET not set");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user with email ${email}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  const exp = Date.now() + hours * 60 * 60 * 1000;
  const payload = { userId: user.id, exp };
  const body = Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
  const sig = await hmac(body, secret);
  const token = `${body}.${sig}`;
  const url = `${baseUrl}/api/auth/magic?token=${token}`;

  console.log(`User: ${user.name} (${user.email})`);
  console.log(`Course: ${user.course ?? "(none)"}`);
  console.log(`Expires: ${new Date(exp).toISOString()} (${hours}h from now)`);
  console.log("");
  console.log("Magic link:");
  console.log(url);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
