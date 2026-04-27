#!/usr/bin/env tsx
/**
 * One-shot password reset for a single locked-out user.
 *
 * Usage:
 *   tsx scripts/reset_user_password.ts <email>           # generates a temp password
 *   tsx scripts/reset_user_password.ts <email> <pass>    # uses the password you supply
 *
 * Behavior:
 *   - Looks up the user by case-insensitive email match.
 *   - Generates a 10-char alphanumeric temp password if one is not supplied.
 *   - Updates User.password (bcrypt, cost 10).
 *   - Normalizes User.email to lowercase, in case it was stored mixed-case.
 *   - Sets emailVerified=true (no-op if already verified).
 *   - Prints the temp password once to stdout. Not logged anywhere else.
 */
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { prisma } from "../src/lib/prisma";

function makeTempPassword(): string {
  // 10 chars, alphanumeric only, no look-alikes (0/O/1/l/I)
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(10);
  let out = "";
  for (let i = 0; i < 10; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

async function main() {
  const rawEmail = process.argv[2];
  const suppliedPassword = process.argv[3];

  if (!rawEmail) {
    console.error("Usage: tsx scripts/reset_user_password.ts <email> [password]");
    process.exit(1);
  }
  if (suppliedPassword && suppliedPassword.length < 6) {
    console.error("Supplied password must be at least 6 characters.");
    process.exit(1);
  }

  const target = rawEmail.trim().toLowerCase();

  const matches = await prisma.$queryRaw<Array<{ id: string; email: string; name: string | null; emailVerified: boolean }>>`
    SELECT id, email, name, emailVerified FROM User WHERE LOWER(email) = ${target}
  `;

  if (matches.length === 0) {
    console.error(`No user found for ${target}`);
    process.exit(1);
  }
  if (matches.length > 1) {
    console.error(`Refusing to proceed: ${matches.length} users match ${target}`);
    for (const m of matches) console.error(`  ${m.id}  ${m.email}`);
    process.exit(1);
  }

  const user = matches[0];
  const tempPassword = suppliedPassword ?? makeTempPassword();
  const hashed = await bcrypt.hash(tempPassword, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashed,
      email: target,
      emailVerified: true,
    },
  });

  console.log("");
  console.log(`Reset successful: ${user.name ?? "(no name)"} <${target}>`);
  if (user.email !== target) {
    console.log(`Stored email normalized: ${user.email} -> ${target}`);
  }
  console.log("");
  console.log(`Temp password: ${tempPassword}`);
  console.log("");
  console.log("Send this to the student. Ask them to log in with the email all-lowercase,");
  console.log("then use the Forgot Password flow once they are in to set a password they will remember.");
}

main()
  .catch((err) => {
    console.error("Reset failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
