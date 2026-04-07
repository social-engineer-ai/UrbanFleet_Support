import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function sendOtpEmail(email: string, otp: string): Promise<boolean> {
  // In development without SMTP configured, log to console
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log(`\n========================================`);
    console.log(`  OTP for ${email}: ${otp}`);
    console.log(`========================================\n`);
    return true;
  }

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || "StakeholderSim <noreply@illinois.edu>",
      to: email,
      subject: "StakeholderSim — Email Verification Code",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #1e3a5f;">StakeholderSim — UrbanFleet</h2>
          <p>Your verification code is:</p>
          <div style="background: #f0f4f8; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1e3a5f;">${otp}</span>
          </div>
          <p style="color: #666;">This code expires in 10 minutes.</p>
          <p style="color: #999; font-size: 12px;">If you didn't request this code, you can ignore this email.</p>
        </div>
      `,
    });
    return true;
  } catch (error) {
    console.error("Failed to send OTP email:", error);
    // Fallback: log to console
    console.log(`\n========================================`);
    console.log(`  OTP for ${email}: ${otp} (email send failed)`);
    console.log(`========================================\n`);
    return true; // Still return true so registration flow continues
  }
}
