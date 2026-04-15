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
  // In development without SMTP configured, log to console so tests can still use the OTP.
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
    // Log the code to stdout so a blocked student can still be unblocked manually from pm2 logs.
    console.log(`\n========================================`);
    console.log(`  OTP for ${email}: ${otp} (email send failed)`);
    console.log(`========================================\n`);
    // Fire-and-forget instructor alert so Ashish learns about SMTP problems immediately.
    const errMsg = error instanceof Error ? error.message : String(error);
    void sendInstructorAlert(
      "OTP email send failed — students blocked from self-registering",
      `A student tried to register or resend an OTP and the email send failed.\n\nStudent email: ${email}\nError: ${errMsg}\n\nLikely causes:\n- Gmail app password revoked (most common — happens whenever the Google account password changes)\n- SMTP creds missing in /opt/stakeholdersim/.env\n- Gmail 2FA disabled on the sending account\n\nFix: rotate the app password at https://myaccount.google.com/apppasswords, update SMTP_PASS in /opt/stakeholdersim/.env, and run "pm2 restart stakeholdersim --update-env".\n\nMeanwhile the OTP is in pm2 logs (grep "OTP for ${email}" /var/log/stakeholdersim/out.log) — you can send it to the student manually.`,
      { category: "smtp_failure", studentEmail: email }
    );
    return false;
  }
}

// =============================================================================
// Instructor alert system
// =============================================================================
// Sends error-category emails to the instructor so operational issues surface
// without waiting for a student complaint. Deduplicates by (category, student)
// within a 30-minute window to prevent flooding, and globally rate-limits to
// 20 alerts per rolling hour to guard against runaway error loops.
// =============================================================================

const INSTRUCTOR_ALERT_EMAIL = process.env.INSTRUCTOR_ALERT_EMAIL || "ashishk@illinois.edu";
const DEDUP_WINDOW_MS = 30 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 20;

const recentAlerts = new Map<string, number>();
const alertTimestamps: number[] = [];

export type AlertCategory =
  | "smtp_failure"
  | "register_crash"
  | "claude_api_error"
  | "grading_error"
  | "verify_otp_crash"
  | "conversation_crash";

export interface AlertMetadata {
  category: AlertCategory;
  studentEmail?: string;
  conversationId?: string;
}

export async function sendInstructorAlert(
  subject: string,
  body: string,
  metadata: AlertMetadata
): Promise<void> {
  const now = Date.now();

  // Rolling-hour rate limit — drop alerts if we've already sent too many.
  while (alertTimestamps.length > 0 && now - alertTimestamps[0] > RATE_LIMIT_WINDOW_MS) {
    alertTimestamps.shift();
  }
  if (alertTimestamps.length >= RATE_LIMIT_MAX) {
    console.warn(`[instructor-alert] rate limit hit (${RATE_LIMIT_MAX}/hr), dropping: ${subject}`);
    return;
  }

  // Per-(category,student) dedup — skip if we've already alerted recently.
  const dedupKey = `${metadata.category}:${metadata.studentEmail || "global"}`;
  const lastSent = recentAlerts.get(dedupKey);
  if (lastSent && now - lastSent < DEDUP_WINDOW_MS) {
    console.log(`[instructor-alert] deduped: ${dedupKey}`);
    return;
  }
  recentAlerts.set(dedupKey, now);
  alertTimestamps.push(now);

  // Prevent the dedup map from growing unbounded over long uptime.
  if (recentAlerts.size > 200) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [k, v] of recentAlerts) {
      if (v < oldestTime) {
        oldestTime = v;
        oldestKey = k;
      }
    }
    if (oldestKey) recentAlerts.delete(oldestKey);
  }

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log(`[instructor-alert] (SMTP not configured) ${subject}\n${body}`);
    return;
  }

  const footer = [
    `---`,
    `Time: ${new Date().toISOString()}`,
    `Category: ${metadata.category}`,
    metadata.studentEmail ? `Student: ${metadata.studentEmail}` : null,
    metadata.conversationId ? `Conversation: ${metadata.conversationId}` : null,
    ``,
    `This is an automated alert from StakeholderSim. Duplicate alerts for the same category+student are suppressed for 30 minutes.`,
  ].filter(Boolean).join("\n");

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || "StakeholderSim <noreply@illinois.edu>",
      to: INSTRUCTOR_ALERT_EMAIL,
      subject: `[StakeholderSim] ${subject}`,
      text: `${body}\n\n${footer}`,
    });
    console.log(`[instructor-alert] sent: ${subject}`);
  } catch (error) {
    // If the alert email itself fails, just log — do NOT recurse.
    console.error(`[instructor-alert] FAILED to send "${subject}":`, error);
  }
}
