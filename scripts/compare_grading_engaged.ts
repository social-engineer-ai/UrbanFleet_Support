// Synthetic "engaged but rough" 358 student transcript, graded under
// both 358 lenient and 558 default calibrations. The student gives
// partial-but-engaged answers throughout (concrete numbers with stated
// assumptions, named infrastructure with what-each-does, rough
// mechanism descriptions, honest gap acknowledgments). This is the
// shape where the 358 leniency overlay should make the most
// difference compared to a strict 558 grade.

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import {
  buildGraderSystemPrompt,
  computeAggregate,
  FINAL_STAKEHOLDERS,
  type GraderOutput,
} from "../src/lib/agents/final558";

const anthropic = new Anthropic();
const GRADER_MODEL = "claude-opus-4-7";
const GRADER_MAX_TOKENS = 3000;

const TRANSCRIPT = `ELENA VASQUEZ: Welcome. Marcus, Priya, James, and I haven't all sat down with you yet, so let's use this session to step through what you built together. Before any of us drills into our specific area, walk us through what you built at a high level: the business problem you were solving, the data you worked with, and the pieces of the system you put together. We'll dig in from there.

STUDENT: The business problem was that UrbanFleet had no real-time visibility into delivery performance. Dispatchers were finding out about late deliveries hours after they happened, and the 2-hour SLA was being missed without anyone knowing in time to act. The data is two streams: GPS pings from vehicle devices roughly every 10 seconds, and delivery events from driver tablets when they scan a package. I built a pipeline that ingests both through Kinesis, cleans them with a Lambda that splits the streams and writes to a raw S3 bucket, then a second Lambda flags deliveries that miss the window and writes alerts to a separate alerts folder. For compliance, the data is queryable through Athena over a Glue catalog.

ELENA VASQUEZ: That's a useful overview. Let me drill into my piece. If a package is going to miss its 2-hour window, how quickly does my dispatch team know about it?

STUDENT: The flag gets written to the alerts folder within seconds of the delivery event arriving. That said, right now my system writes the alert to S3 but doesn't actively push it to a dispatcher's screen. They'd have to query the alerts folder. Building a real dashboard or push notification is the natural next step but not what we built in scope.

ELENA VASQUEZ: That's straight, and I appreciate the honesty. What about a driver in a basement loading dock with no cellular signal for 20 minutes?

STUDENT: That's a real gap. The system's clock starts when the data arrives, not when the event actually happened. So if a driver is offline for 20 minutes, my system thinks everything is fine until they come back into range. We discussed this in scope and it's a known limitation.

ELENA VASQUEZ: Good. What if the piece that creates the flags stops working at 9 AM. How would anyone know?

STUDENT: Right now, they wouldn't. We'd want CloudWatch alarms on Lambda errors plus an SNS notification to wake someone up. We didn't build that in this scope but the mechanism is straightforward to add.

ELENA VASQUEZ: That's fair. I have what I need on operations. Marcus, this lands in your territory next.

MARCUS CHEN: Can I jump in on the cost angle? What does this cost me per month right now, at 200 vehicles, and what is the same number at 500?

STUDENT: At 200 vehicles, my estimate is about $30 per month. The breakdown: Kinesis is the biggest piece at roughly $11 per month for one shard at $0.015 per shard-hour. Lambda is essentially free at this volume because invocations are well under the free tier. S3 storage is under a dollar based on roughly 70 megabytes per day of new data times $0.023 per gigabyte per month. Athena depends on query frequency, but for compliance queries we're looking at $1-2 per month at most.

MARCUS CHEN: Okay, that's a number I can work with. At 500 vehicles?

STUDENT: Roughly $60 to $70 per month. Lambda scales linearly with invocations, S3 storage grows with data volume, and Kinesis stays at one shard until we hit the 1000 records per second throughput limit, which we wouldn't at 500 vehicles. The dominant scaling cost is Lambda and S3 storage, not Kinesis.

MARCUS CHEN: What stops a forgotten resource from quietly costing me $1,200 next month?

STUDENT: Honestly, nothing built in right now. We'd want billing alerts in CloudWatch and tags on every resource so we can attribute costs. That's a near-term addition before this goes to production.

MARCUS CHEN: Numbers are clear enough. Priya, your turn.

PRIYA SHARMA: Let me pull this back to architecture. Your pipeline fails at 2 AM. Nobody is awake. Walk me through what happens, from the failure to a human seeing it the next morning.

STUDENT: Kinesis retains records for 24 hours by default, so data isn't immediately lost. When the consumer Lambda comes back online with the iterator type set to trim horizon, it would pick up from the oldest record still in the stream. The honest answer is that no one would know the Lambda failed at 2 AM until someone notices in the morning. We'd need CloudWatch alarms on the Lambda error rate and an SNS subscription to actually wake someone up. We didn't build that piece.

PRIYA SHARMA: Walk me through what happens to a malformed record.

STUDENT: The consumer Lambda has a try-catch around per-record processing. Records that fail validation get written to a raw/malformed/ folder in S3 instead of crashing the batch. So one bad record doesn't take down the whole batch.

PRIYA SHARMA: Your event-driven Lambda writes back to S3. What stops it from triggering itself in a loop?

STUDENT: The S3 trigger fires on the raw/ prefix, and the enrichment Lambda writes to the processed/ prefix. Different paths, so the trigger never fires on its own writes. That's the prefix isolation pattern.

PRIYA SHARMA: What about a record that fails three times after Lambda's built-in retries?

STUDENT: We didn't configure a dead letter queue. After retries are exhausted, the record would fail silently and we'd lose visibility. That's a gap. A DLQ on the Lambda or on the Kinesis consumer would be the production-hardening step.

PRIYA SHARMA: I'm satisfied. James?

JAMES WHITFIELD: Let me bring this back to compliance. It's Tuesday morning, a pharma client calls, they want me to prove vehicle VH-042 delivered package PKG-88201 to their facility last Thursday at 2:15 PM. How long until I can answer them, and how do you know the data they get is trustworthy?

STUDENT: The data lives in S3 partitioned by day. The Glue Crawler picks up the partitions automatically. From Athena, an analyst writes a SQL query that joins the deliveries table and the gps table on vehicle_id and timestamp, filters to the package_id PKG-88201, and narrows to the Thursday partition. Parquet format means Athena only reads the relevant columns. The query comes back in seconds, not minutes.

JAMES WHITFIELD: How do I know the GPS data hasn't been tampered with?

STUDENT: Honestly, that's a gap. We don't have S3 Object Lock enabled, and we don't have versioning on the raw bucket. If a regulator asks me to prove the raw data hasn't been edited, I can't prove it today. Both Object Lock and versioning would need to be added before the pharma contract is signed.

JAMES WHITFIELD: What about an audit trail of who has accessed the data?

STUDENT: We have CloudWatch logs for Lambda executions, but we don't have an Athena query history that shows who ran what query and when. CloudTrail with Athena workgroups would give us that. Not built today.

JAMES WHITFIELD: Retention?

STUDENT: The project required 90 days of standard storage, then archival. We'd configure S3 lifecycle policies to transition objects to Glacier after 90 days and enforce the retention window. Lifecycle rules apply at the bucket level so it's automatic.

JAMES WHITFIELD: I have what I need on compliance. The query structure is sound, the latency is defensible, and you were honest about the integrity and audit gaps. Those are the right gaps to close before going live.

ELENA VASQUEZ: Okay, that's a good place to wrap. Good work today.`;

const COVERAGE_SUMMARY = FINAL_STAKEHOLDERS.map(
  (s) => `${s}: C1, C2, C3, C4`
).join("\n");

const userMessage = `<transcript>
${TRANSCRIPT}
</transcript>

<coverage>
${COVERAGE_SUMMARY}
</coverage>

<auto_flags>
No auto-flags.
</auto_flags>

Output the grading JSON now.`;

function parseFirstJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

async function gradeOnce(course: "358" | "558"): Promise<GraderOutput | null> {
  const res = await anthropic.messages.create({
    model: GRADER_MODEL,
    max_tokens: GRADER_MAX_TOKENS,
    system: buildGraderSystemPrompt(course),
    messages: [{ role: "user", content: userMessage }],
  });
  const text = res.content
    .filter((c) => c.type === "text")
    .map((c) => (c as { text: string }).text)
    .join("");
  const json = parseFirstJson(text);
  return (json as unknown as GraderOutput) ?? null;
}

async function main() {
  console.log("Grading synthetic 'engaged-but-rough' transcript under 358 lenient...");
  const g358 = await gradeOnce("358");
  console.log("Grading same transcript under 558 default...");
  const g558 = await gradeOnce("558");

  if (!g358 || !g558) {
    console.error("Grader returned null");
    return;
  }

  const a358 = computeAggregate(g358);
  const a558 = computeAggregate(g558);

  console.log("\n=== AGGREGATE (0-50 scale) ===");
  console.log(`  358 lenient: ${a358.toFixed(2)} / 50`);
  console.log(`  558 default: ${a558.toFixed(2)} / 50`);
  console.log(
    `  Gap: ${(a358 - a558).toFixed(2)} pts (${(((a358 - a558) / Math.max(a558, 0.01)) * 100).toFixed(0)}% higher under 358)`
  );

  console.log("\n=== PER-CELL (358 / 558) ===");
  console.log("Stakeholder    C1     C2     C3     C4");
  for (const s of FINAL_STAKEHOLDERS) {
    const row = ["C1", "C2", "C3", "C4"].map((p) => {
      const v358 = (g358[s] as unknown as Record<string, number>)[p];
      const v558 = (g558[s] as unknown as Record<string, number>)[p];
      return `${v358}/${v558}`;
    });
    console.log(`  ${s.padEnd(8)} ${row.map((x) => x.padEnd(6)).join(" ")}`);
  }
  console.log("Cross-cutting  D1     D2     D3");
  const cross = ["D1", "D2", "D3"].map((d) => {
    const v358 = (g358.cross_cutting as Record<string, number | string>)[d] as number;
    const v558 = (g558.cross_cutting as Record<string, number | string>)[d] as number;
    return `${v358}/${v558}`;
  });
  console.log(`  (358/558)  ${cross.map((x) => x.padEnd(6)).join(" ")}`);

  console.log("\n=== 358 OVERALL NOTES ===");
  console.log(g358.overall_notes);
  console.log("\n=== 558 OVERALL NOTES ===");
  console.log(g558.overall_notes);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
