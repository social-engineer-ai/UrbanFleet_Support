import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function FinalCompletePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  const finalSession = await prisma.final558Session.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!finalSession) redirect("/chat");

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <div className="max-w-xl w-full bg-white border rounded-2xl p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-gray-900">
          You have completed your BADM 558 final.
        </h1>
        <p className="mt-3 text-sm text-gray-700 leading-relaxed">
          Your conversation has been recorded and is being graded. Your final
          score will appear on your dashboard once your instructor has reviewed
          it.
        </p>
        <div className="mt-6">
          <Link
            href="/chat"
            className="inline-block bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
