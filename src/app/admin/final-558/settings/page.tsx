import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Final558SettingsClient } from "@/components/Final558SettingsClient";

export default async function Final558SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (!user || user.role !== "instructor") {
    redirect("/chat");
  }

  return <Final558SettingsClient />;
}
