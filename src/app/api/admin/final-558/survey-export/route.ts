import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SURVEY_QUESTIONS } from "@/lib/final558/survey";

// CSV export of all final-defense survey responses. Instructor / TA
// only. Defaults to anonymized (no name, no email): one row per
// response keyed by responseId. Pass ?identified=1 to include
// name/email — useful when an instructor needs to follow up with
// students who chose "quote by name" on Q17.

function csvEscape(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || !["instructor", "ta"].includes(user.role)) {
    return Response.json({ error: "Instructor access required" }, { status: 403 });
  }

  const url = new URL(req.url);
  const identified = url.searchParams.get("identified") === "1";

  const responses = await prisma.finalSurveyResponse.findMany({
    orderBy: { submittedAt: "asc" },
    include: identified ? { user: { select: { name: true, email: true } } } : undefined,
  });

  // Build header row: anonymized id + course + submission time, then a
  // column per question.
  const headers: string[] = ["response_id", "course", "submitted_at"];
  if (identified) headers.push("name", "email");
  for (const q of SURVEY_QUESTIONS) {
    headers.push(`q${q.number}`);
    if (q.type === "multi" || q.type === "multi_capped") {
      headers.push(`q${q.number}_other`);
    }
    if (q.type === "single_with_text_option") {
      headers.push(`q${q.number}_text`);
    }
  }

  const rows: string[] = [headers.join(",")];

  for (const r of responses) {
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(r.responses);
    } catch {
      /* keep parsed empty */
    }
    const row: string[] = [
      r.id,
      r.course,
      r.submittedAt.toISOString(),
    ];
    if (identified) {
      const u = (r as unknown as { user?: { name?: string; email?: string } }).user;
      row.push(csvEscape(u?.name));
      row.push(csvEscape(u?.email));
    }
    for (const q of SURVEY_QUESTIONS) {
      const v = parsed[q.id];
      const formatted = Array.isArray(v) ? v.join("|") : (v as string | undefined) ?? "";
      row.push(csvEscape(formatted));
      if (q.type === "multi" || q.type === "multi_capped") {
        row.push(csvEscape(parsed[`${q.id}_other`] as string | undefined));
      }
      if (q.type === "single_with_text_option") {
        row.push(csvEscape(parsed[`${q.id}_text`] as string | undefined));
      }
    }
    rows.push(row.map((c) => (typeof c === "string" ? c : String(c))).join(","));
  }

  return new Response(rows.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="final_survey_${identified ? "identified" : "anonymous"}_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
