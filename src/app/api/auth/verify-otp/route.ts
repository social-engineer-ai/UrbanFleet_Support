import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { email, code } = await req.json();

  if (!email || !code) {
    return Response.json({ error: "Email and code required" }, { status: 400 });
  }

  // Find valid OTP
  const otpRecord = await prisma.otpCode.findFirst({
    where: {
      email,
      code,
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
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  await prisma.user.update({
    where: { email },
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
      client: {
        stakeholder_engagement: 0,
        requirements_discovery: 0,
        solution_presentation: 0,
        total_meetings: 0,
      },
      mentor: {
        question_quality: 0,
        reflection_depth: 0,
        growth_and_iteration: 0,
        total_sessions: 0,
      },
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
