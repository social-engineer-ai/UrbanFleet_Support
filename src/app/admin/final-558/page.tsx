import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Final558ListClient } from "@/components/Final558ListClient";

export default async function Final558ListPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (!user || !["instructor", "ta"].includes(user.role)) {
    redirect("/chat");
  }

  return <Final558ListClient />;
}
