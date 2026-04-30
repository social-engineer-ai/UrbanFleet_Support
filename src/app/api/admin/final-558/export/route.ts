import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  computeAggregate,
  DEFAULT_WEIGHTS,
  type GraderOutput,
  FINAL_STAKEHOLDERS,
} from "@/lib/agents/final558";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || !["instructor", "ta"].includes(user.role)) {
    return Response.json({ error: "Instructor access required" }, { status: 403 });
  }

  const sessions = await prisma.final558Session.findMany({
    orderBy: { startedAt: "desc" },
    include: {
      user: { select: { name: true, email: true } },
      score: true,
    },
  });

  const headers = [
    "Student",
    "Email",
    "Started",
    "Ended",
    "Duration (s)",
    "End reason",
    "Flagged",
    "Flag reasons",
    "Aggregate (0-100)",
    "Reviewed at",
  ];
  // Per-stakeholder per-coverage columns (16)
  for (const sh of FINAL_STAKEHOLDERS) {
    for (const p of ["C1", "C2", "C3", "C4"]) {
      headers.push(`${sh}.${p}`);
    }
  }
  // Cross-cutting (3)
  for (const d of ["D1", "D2", "D3"]) {
    headers.push(d);
  }

  const escape = (v: unknown) => {
    const s = String(v ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const rows = sessions.map((s) => {
    let raw: GraderOutput | null = null;
    let overrides: Record<string, number> = {};
    let aggregate: number | null = null;
    if (s.score) {
      try {
        raw = JSON.parse(s.score.rawJson) as GraderOutput;
        overrides = s.score.instructorEdit
          ? (JSON.parse(s.score.instructorEdit) as Record<string, number>)
          : {};
        aggregate = computeAggregate(raw, DEFAULT_WEIGHTS, overrides);
      } catch {
        aggregate = s.score.aggregate;
      }
    }
    const get = (key: string, fallback: number | null) =>
      typeof overrides[key] === "number" ? overrides[key] : fallback;

    const row: (string | number | null)[] = [
      s.user.name,
      s.user.email,
      s.startedAt.toISOString(),
      s.endedAt?.toISOString() ?? "",
      s.endedAt
        ? Math.floor((s.endedAt.getTime() - s.startedAt.getTime()) / 1000)
        : "",
      s.endReason ?? "",
      s.flaggedForReview ? "yes" : "no",
      s.flagReasons ?? "",
      aggregate ?? "",
      s.score?.reviewedAt?.toISOString() ?? "",
    ];

    for (const sh of FINAL_STAKEHOLDERS) {
      for (const p of ["C1", "C2", "C3", "C4"] as const) {
        const ai = raw ? raw[sh][p] : null;
        row.push(get(`${sh}.${p}`, ai));
      }
    }
    for (const d of ["D1", "D2", "D3"] as const) {
      const ai = raw ? raw.cross_cutting[d] : null;
      row.push(get(d, ai));
    }
    return row;
  });

  const csv = [headers.join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="final_558_${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
