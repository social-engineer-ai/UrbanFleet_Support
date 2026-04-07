import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { generateOtp, sendOtpEmail } from "@/lib/email";

// Step 1: Register and send OTP
export async function POST(req: NextRequest) {
  const { email, password, name, course, teamName } = await req.json();

  if (!email || !password || !name || !teamName) {
    return Response.json({ error: "Missing required fields (name, email, password, and team name are all required)" }, { status: 400 });
  }

  if (password.length < 6) {
    return Response.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  // Validate UIUC email
  if (!email.endsWith("@illinois.edu")) {
    return Response.json(
      { error: "Must use an @illinois.edu email address" },
      { status: 400 }
    );
  }

  // Check if already registered and verified
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.emailVerified) {
    return Response.json({ error: "Email already registered" }, { status: 400 });
  }

  // If unverified account exists, delete it so they can re-register
  if (existing && !existing.emailVerified) {
    await prisma.studentState.deleteMany({ where: { userId: existing.id } });
    await prisma.user.delete({ where: { id: existing.id } });
  }

  // Find or create team
  const normalizedTeamName = teamName.trim().toLowerCase();
  let team = await prisma.team.findFirst({
    where: { name: normalizedTeamName, course: course || "558" },
  });
  if (!team) {
    team = await prisma.team.create({
      data: { name: normalizedTeamName, course: course || "558" },
    });
  }

  // Create unverified user
  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      password: hashed,
      name,
      role: "student",
      course: course || "558",
      teamId: team.id,
      emailVerified: false,
    },
  });

  // Generate and store OTP (expires in 10 minutes)
  const otp = generateOtp();
  await prisma.otpCode.create({
    data: {
      email,
      code: otp,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });

  // Send OTP email
  await sendOtpEmail(email, otp);

  return Response.json({
    success: true,
    userId: user.id,
    message: "Verification code sent to your email",
    requiresOtp: true,
  });
}
