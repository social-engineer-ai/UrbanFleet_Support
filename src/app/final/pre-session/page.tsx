import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  checkFinalEntryPreconditions,
  hasValidFinalAuthCookie,
} from "@/lib/final558/auth";
import { PreSessionClient } from "@/components/PreSessionClient";

export default async function PreSessionPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/final");

  const pre = await checkFinalEntryPreconditions(session.user.id);
  if (!pre.ok) redirect("/final");

  if (!(await hasValidFinalAuthCookie(session.user.id))) {
    redirect("/final");
  }

  // If a session already exists for this user (e.g. they refreshed mid-exam),
  // jump back into it.
  const existing = await prisma.final558Session.findUnique({
    where: { userId: session.user.id },
  });
  if (existing && !existing.endedAt) {
    redirect(`/final/session/${existing.id}`);
  }
  if (existing && existing.endedAt) {
    redirect(`/final/complete/${existing.id}`);
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true },
  });

  const firstName = user?.name?.split(" ")[0] || "Student";

  return <PreSessionClient firstName={firstName} />;
}
