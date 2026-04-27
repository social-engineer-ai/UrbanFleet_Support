import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { generateOtp, sendOtpEmail, sendInstructorAlert } from "@/lib/email";

// Step 1: Register and send OTP
export async function POST(req: NextRequest) {
  try {
    const { email, password, name, course, teamName } = await req.json();

    if (!email || !password || !name || !teamName) {
      return Response.json({ error: "Missing required fields (name, email, password, and team name are all required)" }, { status: 400 });
    }

    if (password.length < 6) {
      return Response.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Validate UIUC email
    if (!normalizedEmail.endsWith("@illinois.edu")) {
      return Response.json(
        { error: "Must use an @illinois.edu email address" },
        { status: 400 }
      );
    }

    // Check if already registered and verified
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
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
        email: normalizedEmail,
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
        email: normalizedEmail,
        code: otp,
        purpose: "verify_email",
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    // Send OTP email — if it fails, surface a real error to the student so they know to retry
    // or contact the instructor. (The instructor has already been alerted by sendOtpEmail.)
    const sent = await sendOtpEmail(normalizedEmail, otp);
    if (!sent) {
      return Response.json(
        {
          error:
            "We couldn't send your verification code right now. The instructor has been alerted and is looking into it. Please try again in a few minutes, or email ashishk@illinois.edu if the problem persists.",
        },
        { status: 503 }
      );
    }

    return Response.json({
      success: true,
      userId: user.id,
      message: "Verification code sent to your email",
      requiresOtp: true,
    });
  } catch (error) {
    console.error("Registration error:", error);
    const errMsg = error instanceof Error ? error.message : String(error);
    void sendInstructorAlert(
      "Registration endpoint crashed",
      `The /api/auth/register endpoint threw an unexpected error (not an SMTP issue — this is a code-level crash).\n\nError: ${errMsg}\n\nStack:\n${error instanceof Error ? error.stack || "(no stack)" : "N/A"}`,
      { category: "register_crash" }
    );
    return Response.json(
      { error: "Something went wrong on our end. The instructor has been notified — please try again shortly." },
      { status: 500 }
    );
  }
}
