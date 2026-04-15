import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Individual leaderboard for Part 3 (Features Proposals). Ranks students by the
// number of ended Part 3 meetings they've had with any stakeholder. Filtered by
// course section so 358 students see 358, 558 students see 558. A student can be
// visible even after a single features meeting — the leaderboard is about
// recognizing effort, not just gating the top three.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const course = url.searchParams.get("course") || "558";

  // Count ended Part 3 meetings per student, scoped to the given course.
  const students = await prisma.user.findMany({
    where: {
      role: "student",
      course,
    },
    select: {
      id: true,
      name: true,
      conversations: {
        where: {
          agentType: "client",
          meetingType: "features",
          endedAt: { not: null },
        },
        select: { id: true },
      },
    },
  });

  const ranked = students
    .map((s) => ({
      name: s.name,
      featureProposals: s.conversations.length,
    }))
    .filter((s) => s.featureProposals > 0)
    .sort((a, b) => b.featureProposals - a.featureProposals);

  return Response.json({
    course,
    entries: ranked,
  });
}
