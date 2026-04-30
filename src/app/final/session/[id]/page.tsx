import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasValidFinalAuthCookie } from "@/lib/final558/auth";
import { FinalSessionClient } from "@/components/FinalSessionClient";

export default async function FinalSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/final");

  const { id } = await params;

  const finalSession = await prisma.final558Session.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!finalSession) redirect("/final");

  if (finalSession.endedAt) {
    redirect(`/final/complete/${id}`);
  }

  if (!(await hasValidFinalAuthCookie(session.user.id))) {
    // Cookie expired mid-exam (90-min lifetime) — they need to re-auth, but
    // their session lives on; we let them through with a warning displayed
    // client-side rather than redirecting back to the gate, since the
    // session timer is already running.
  }

  return <FinalSessionClient sessionId={id} />;
}
