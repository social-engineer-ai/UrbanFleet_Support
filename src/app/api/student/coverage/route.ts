import { auth } from "@/lib/auth";
import { computeClientCoverage, coverageTotals } from "@/lib/coverage";
import { DEADLINES } from "@/lib/deadlines";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const coverage = await computeClientCoverage(session.user.id);
  const totals = coverageTotals(coverage);

  return Response.json({
    coverage,
    totals,
    deadlines: DEADLINES,
  });
}
