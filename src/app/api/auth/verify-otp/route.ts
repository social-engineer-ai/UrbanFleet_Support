import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { email, code } = await req.json();

  if (!email || !code) {
    return Response.json({ error: "Email and code required" }, { status: 400 });
  }

  const normalized = email.trim().toLowerCase();

  // Find valid OTP (scoped to email-verification codes — password-reset codes
  // live in the same table but have purpose = "reset_password" and must not be
  // accepted here, since this route also creates the StudentState row).
  const otpRecord = await prisma.otpCode.findFirst({
    where: {
      email: normalized,
      code,
      purpose: "verify_email",
      used: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!otpRecord) {
    return Response.json(
      { error: "Invalid or expired verification code" },
      { status: 400 }
    );
  }

  // Mark OTP as used
  await prisma.otpCode.update({
    where: { id: otpRecord.id },
    data: { used: true },
  });

  // Mark user as verified
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  await prisma.user.update({
    where: { email: normalized },
    data: { emailVerified: true },
  });

  // Create initial student state
  const initialState = {
    student_id: user.id,
    student_name: user.name,
    course: user.course || "558",
    requirements_uncovered: {
      real_time_visibility: { discovered: false },
      sla_monitoring: { discovered: false },
      idle_vehicle_detection: { discovered: false },
      cost_constraints: { discovered: false },
      compliance_retention: { discovered: false },
      compliance_queryability: { discovered: false },
      scaling_to_500: { discovered: false },
      failure_handling: { discovered: false },
    },
    architecture_decisions: [],
    build_progress: {
      phase_1: { status: "not_started" },
      phase_2: { status: "not_started" },
      phase_3: { status: "not_started" },
      phase_4: { status: "not_started" },
    },
    hint_log: [],
    lambda_code_log: [],
    debug_log: [],
    conversation_scores: {
      engagement: { elena: 0, marcus: 0, priya: 0, james: 0, mentor: 0 },
      problem_understanding: { elena: 0, marcus: 0, priya: 0, james: 0, mentor_quality: 0 },
      solution_explanation: { elena: 0, marcus: 0, priya: 0, james: 0 },
      total_meetings: 0,
      total_sessions: 0,
      assessment_phase: "build",
    },
    flags: [],
  };

  await prisma.studentState.create({
    data: {
      userId: user.id,
      stateJson: JSON.stringify(initialState),
    },
  });

  return Response.json({ success: true, message: "Email verified successfully" });
}
