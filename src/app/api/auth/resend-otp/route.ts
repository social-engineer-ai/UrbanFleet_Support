import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateOtp, sendOtpEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  const { email } = await req.json();

  if (!email) {
    return Response.json({ error: "Email required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.emailVerified) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  // Invalidate old OTPs
  await prisma.otpCode.updateMany({
    where: { email, used: false },
    data: { used: true },
  });

  // Generate new OTP
  const otp = generateOtp();
  await prisma.otpCode.create({
    data: {
      email,
      code: otp,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });

  await sendOtpEmail(email, otp);

  return Response.json({ success: true, message: "New code sent" });
}
