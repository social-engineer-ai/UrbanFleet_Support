import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sendInstructorAlert } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const { email, code, newPassword } = await req.json();

    if (!email || !code || !newPassword) {
      return Response.json(
        { error: "Email, code, and new password are required" },
        { status: 400 }
      );
    }

    if (typeof newPassword !== "string" || newPassword.length < 6) {
      return Response.json(
        { error: "New password must be at least 6 characters" },
        { status: 400 }
      );
    }

    const normalized = email.trim().toLowerCase();

    const otpRecord = await prisma.otpCode.findFirst({
      where: {
        email: normalized,
        code,
        purpose: "reset_password",
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!otpRecord) {
      return Response.json(
        { error: "Invalid or expired reset code" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { email: normalized } });
    if (!user || !user.emailVerified) {
      // Shouldn't happen — forgot-password only issues codes for verified users.
      return Response.json({ error: "Account not found" }, { status: 404 });
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    // Mark the code used and update the password in a single transaction so a
    // failure midway can't leave a used code without a password change.
    await prisma.$transaction([
      prisma.otpCode.update({
        where: { id: otpRecord.id },
        data: { used: true },
      }),
      prisma.user.update({
        where: { email: normalized },
        data: { password: hashed },
      }),
    ]);

    return Response.json({
      success: true,
      message: "Password updated successfully. You can now sign in with your new password.",
    });
  } catch (error) {
    console.error("Reset-password error:", error);
    const errMsg = error instanceof Error ? error.message : String(error);
    void sendInstructorAlert(
      "Reset-password endpoint crashed",
      `The /api/auth/reset-password endpoint threw an unexpected error.\n\nError: ${errMsg}\n\nStack:\n${error instanceof Error ? error.stack || "(no stack)" : "N/A"}`,
      { category: "register_crash" }
    );
    return Response.json(
      { error: "Something went wrong. The instructor has been notified." },
      { status: 500 }
    );
  }
}
