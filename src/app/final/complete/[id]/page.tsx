import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FinalSurveyForm } from "@/components/FinalSurveyForm";

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

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { course: true },
  });
  const courseLabel = user?.course === "358" ? "BADM 358" : "BADM 558";

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="max-w-2xl mx-auto bg-white border rounded-2xl p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-gray-900">
          You have completed your {courseLabel} final.
        </h1>
        <p className="mt-3 text-sm text-gray-700 leading-relaxed">
          Your conversation has been recorded. Your final score will appear on
          your dashboard once your instructor has reviewed it.
        </p>
        <p className="mt-3 text-sm text-gray-700 leading-relaxed">
          Before you leave, would you take a few minutes to share feedback on
          the experience?
        </p>

        <FinalSurveyForm />
      </div>
    </main>
  );
}
