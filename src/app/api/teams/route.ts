import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// GET: List existing team names for a course (public — used during registration)
export async function GET(req: NextRequest) {
  const course = req.nextUrl.searchParams.get("course") || "558";

  const teams = await prisma.team.findMany({
    where: { course },
    select: { id: true, name: true, _count: { select: { members: true } } },
    orderBy: { name: "asc" },
  });

  return Response.json(
    teams.map((t) => ({
      id: t.id,
      name: t.name,
      memberCount: t._count.members,
    }))
  );
}
