import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const PASTE_RATIO_THRESHOLD = 0.2; // 20%
const SINGLE_PASTE_FLAG_LEN = 200;
const FOCUS_EVENT_FLAG_COUNT = 3;
const FOCUS_HIDDEN_FLAG_SECONDS = 30;

interface PastePayload {
  type: "paste";
  length: number;
}

interface FocusBlurPayload {
  type: "focus_blur";
}

interface FocusReturnPayload {
  type: "focus_return";
  hiddenMs: number;
}

interface WarningDismissedPayload {
  type: "warning_dismissed";
  warning: string;
}

type EventPayload =
  | PastePayload
  | FocusBlurPayload
  | FocusReturnPayload
  | WarningDismissedPayload;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = authSession.user.id;

  const { id: sessionId } = await params;
  const body = (await req.json().catch(() => null)) as EventPayload | null;
  if (!body || !body.type) {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }

  const finalSession = await prisma.final558Session.findFirst({
    where: { id: sessionId, userId },
  });
  if (!finalSession) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }
  // Events keep flowing even after end (e.g. a late paste record arrives) —
  // we accept and persist them but don't update flags after lock.
  const isLocked = !!finalSession.lockedAt;

  await prisma.final558Event.create({
    data: {
      sessionId,
      type: body.type,
      payload: JSON.stringify(body),
    },
  });

  if (isLocked) {
    return Response.json({ ok: true, locked: true });
  }

  // Update aggregated counters used for auto-flag thresholds.
  const updates: Partial<{
    pasteCharCount: { increment: number };
    tabHiddenCount: { increment: number };
    tabHiddenSeconds: { increment: number };
  }> = {};

  if (body.type === "paste") {
    updates.pasteCharCount = { increment: Math.max(0, body.length || 0) };
  } else if (body.type === "focus_blur") {
    updates.tabHiddenCount = { increment: 1 };
  } else if (body.type === "focus_return") {
    updates.tabHiddenSeconds = {
      increment: Math.max(0, Math.floor((body.hiddenMs || 0) / 1000)),
    };
  }

  if (Object.keys(updates).length > 0) {
    await prisma.final558Session.update({
      where: { id: sessionId },
      data: updates,
    });
  }

  // Re-read to evaluate flag rules holistically.
  const refreshed = await prisma.final558Session.findUnique({
    where: { id: sessionId },
  });
  if (!refreshed) return Response.json({ ok: true });

  const reasons: string[] = [];
  const pasteRatio =
    refreshed.typedCharCount + refreshed.pasteCharCount > 0
      ? refreshed.pasteCharCount /
        (refreshed.typedCharCount + refreshed.pasteCharCount)
      : 0;
  if (pasteRatio > PASTE_RATIO_THRESHOLD) reasons.push("paste_ratio");
  if (body.type === "paste" && body.length >= SINGLE_PASTE_FLAG_LEN) {
    reasons.push("large_paste");
  }
  if (refreshed.tabHiddenCount >= FOCUS_EVENT_FLAG_COUNT) reasons.push("tab_switches");
  if (refreshed.tabHiddenSeconds >= FOCUS_HIDDEN_FLAG_SECONDS) reasons.push("tab_hidden_duration");

  if (reasons.length > 0 && !refreshed.flaggedForReview) {
    await prisma.final558Session.update({
      where: { id: sessionId },
      data: {
        flaggedForReview: true,
        flagReasons: JSON.stringify(reasons),
      },
    });
  } else if (reasons.length > 0 && refreshed.flaggedForReview) {
    // Keep flag list current as new reasons emerge.
    const existing = refreshed.flagReasons
      ? (JSON.parse(refreshed.flagReasons) as string[])
      : [];
    const merged = Array.from(new Set([...existing, ...reasons]));
    if (merged.length !== existing.length) {
      await prisma.final558Session.update({
        where: { id: sessionId },
        data: { flagReasons: JSON.stringify(merged) },
      });
    }
  }

  return Response.json({ ok: true, flagged: reasons.length > 0 });
}
