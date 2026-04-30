import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import {
  verifyFinalPassword,
  checkFinalEntryPreconditions,
  formatTimeShort,
} from "@/lib/final558/auth";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const password = typeof body?.password === "string" ? body.password : "";
  if (!password) {
    return Response.json({ error: "Password required" }, { status: 400 });
  }

  // Re-check preconditions on every submission. A student whose status
  // changed (e.g. they completed a final in another tab) shouldn't be
  // able to log in via this route.
  const pre = await checkFinalEntryPreconditions(session.user.id);
  if (!pre.ok) {
    return Response.json(
      { error: pre.error, meta: pre.errorMeta },
      { status: 403 }
    );
  }

  const result = await verifyFinalPassword(session.user.id, password);
  if (result.ok) {
    return Response.json({ ok: true });
  }

  if (result.locked) {
    return Response.json(
      {
        error: "locked",
        unlockAt: result.unlockAt?.toISOString(),
        unlockAtShort: result.unlockAt
          ? formatTimeShort(result.unlockAt)
          : null,
      },
      { status: 429 }
    );
  }

  return Response.json(
    { error: "wrong_password", remaining: result.remaining },
    { status: 401 }
  );
}
