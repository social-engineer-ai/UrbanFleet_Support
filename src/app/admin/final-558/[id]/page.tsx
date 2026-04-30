import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Final558DetailClient } from "@/components/Final558DetailClient";

export default async function Final558DetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (!user || !["instructor", "ta"].includes(user.role)) {
    redirect("/chat");
  }

  const { id } = await params;
  return <Final558DetailClient sessionId={id} />;
}
