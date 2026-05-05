import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateSurveyResponses } from "@/lib/final558/survey";

// GET: returns existing response for the current user (so the UI can
// show "thanks, already submitted" if they refresh the page).
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const existing = await prisma.finalSurveyResponse.findUnique({
    where: { userId: session.user.id },
  });
  if (!existing) return Response.json({ submitted: false });
  return Response.json({
    submitted: true,
    submittedAt: existing.submittedAt.toISOString(),
  });
}

// POST: store the survey response. One submission per user (DB unique
// constraint on userId enforces). Identity is captured intentionally so
// instructors can track completeness; instructor-facing exports default
// to anonymized aggregates.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const validationError = validateSurveyResponses(body);
  if (validationError) {
    return Response.json({ error: validationError }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { course: true },
  });
  const course = user?.course ?? "unknown";

  // Best-effort: link to the most recent ended Final558Session for this
  // user so we can correlate survey to a specific exam if needed. Not
  // required for the survey to be useful.
  const finalSession = await prisma.final558Session.findFirst({
    where: { userId: session.user.id },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });

  try {
    await prisma.finalSurveyResponse.create({
      data: {
        userId: session.user.id,
        sessionId: finalSession?.id ?? null,
        course,
        responses: JSON.stringify(body),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Unique constraint")) {
      return Response.json(
        { error: "Already submitted" },
        { status: 409 }
      );
    }
    console.error("Survey save failed:", err);
    return Response.json({ error: "Could not save response" }, { status: 500 });
  }

  return Response.json({ ok: true });
}
