import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateOtp, sendOtpEmail, sendInstructorAlert } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return Response.json({ error: "Email required" }, { status: 400 });
    }

    const normalized = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({ where: { email: normalized } });
    if (!user || user.emailVerified) {
      return Response.json({ error: "Invalid request" }, { status: 400 });
    }

    // Invalidate old verify-email OTPs (don't touch password-reset codes for this email)
    await prisma.otpCode.updateMany({
      where: { email: normalized, purpose: "verify_email", used: false },
      data: { used: true },
    });

    // Generate new OTP
    const otp = generateOtp();
    await prisma.otpCode.create({
      data: {
        email: normalized,
        code: otp,
        purpose: "verify_email",
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    const sent = await sendOtpEmail(normalized, otp);
    if (!sent) {
      return Response.json(
        {
          error:
            "We couldn't send your verification code right now. The instructor has been alerted — please try again in a few minutes or email ashishk@illinois.edu.",
        },
        { status: 503 }
      );
    }

    return Response.json({ success: true, message: "New code sent" });
  } catch (error) {
    console.error("Resend OTP error:", error);
    const errMsg = error instanceof Error ? error.message : String(error);
    void sendInstructorAlert(
      "Resend-OTP endpoint crashed",
      `The /api/auth/resend-otp endpoint threw an unexpected error.\n\nError: ${errMsg}\n\nStack:\n${error instanceof Error ? error.stack || "(no stack)" : "N/A"}`,
      { category: "register_crash" }
    );
    return Response.json(
      { error: "Something went wrong. The instructor has been notified." },
      { status: 500 }
    );
  }
}
