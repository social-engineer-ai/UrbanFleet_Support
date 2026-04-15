import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateOtp, sendPasswordResetEmail, sendInstructorAlert } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== "string") {
      return Response.json({ error: "Email required" }, { status: 400 });
    }

    const normalized = email.trim().toLowerCase();

    // We intentionally return the same response whether the user exists or not,
    // so this endpoint can't be used to enumerate registered emails.
    const genericResponse = Response.json({
      success: true,
      message: "If an account exists for that email, a reset code has been sent.",
    });

    const user = await prisma.user.findUnique({ where: { email: normalized } });
    if (!user || !user.emailVerified) {
      return genericResponse;
    }

    // Invalidate any outstanding reset codes for this email so only the newest one works.
    await prisma.otpCode.updateMany({
      where: { email: normalized, purpose: "reset_password", used: false },
      data: { used: true },
    });

    const otp = generateOtp();
    await prisma.otpCode.create({
      data: {
        email: normalized,
        code: otp,
        purpose: "reset_password",
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    const sent = await sendPasswordResetEmail(normalized, otp);
    if (!sent) {
      return Response.json(
        {
          error:
            "We couldn't send your reset code right now. The instructor has been alerted — please try again in a few minutes or email ashishk@illinois.edu.",
        },
        { status: 503 }
      );
    }

    return genericResponse;
  } catch (error) {
    console.error("Forgot-password error:", error);
    const errMsg = error instanceof Error ? error.message : String(error);
    void sendInstructorAlert(
      "Forgot-password endpoint crashed",
      `The /api/auth/forgot-password endpoint threw an unexpected error.\n\nError: ${errMsg}\n\nStack:\n${error instanceof Error ? error.stack || "(no stack)" : "N/A"}`,
      { category: "register_crash" }
    );
    return Response.json(
      { error: "Something went wrong. The instructor has been notified." },
      { status: 500 }
    );
  }
}
