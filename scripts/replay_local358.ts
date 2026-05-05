// Replay local358's prior final session through the API and report the
// grade. Reads the captured student turns, runs a clean fresh session,
// ends it, lets the grader run, and prints results.
//
// Run: npx tsx scripts/replay_local358.ts

import { PrismaClient } from "@prisma/client";

const BASE = "http://localhost:3000";
const EMAIL = "local358@test.edu";
const PASSWORD = "test1234";
const COHORT_PASSWORD = "letmein";

const STUDENT_TURNS: string[] = [
  "I built infrastructure for you.",
  "I am not sure.",
  "I was trying to help you get a better view into your deliveries",
  "Not sure, whether they had any mechanism but now there is a report generated when the deleivery is outside the promised window",
  "The report is submitted on an s3 bucket, which can be queried using Athena for SQL queries",
  "So as soon as the delivery data comes in, we can flag whether this was on time or late",
  "When the driver submit the dleivery data, we also recive the gps data from gps devices, and these come on Kinesis stream which a lambda cleans and saves into a raw bucket, separated for delivery and gps. Then, a set of lambdas check these files and test for anamolies and create flags whether on_time or not. For compliance this report can be queried on histroical data",
  "The tablets now have internet so they send the data as soon as the driver updates the status",
  "In the version, we have not been asked to send any alert to the dispacher, but what we have built can easily be extended to deliver that also",
  "Yes. If someone has specific vehicle or package in mind, they may also run a query",
  "Since we don't receive the data when the system is disconnected, we only log it once we receive it.",
  "Yes",
  "I don't think this was covered in 358 project scope",
  "Yes, they can run queries targeting any specific filter",
  "I think (not sure), we retain 90 days data in standard s3 bucket after it is archived in Glacier",
  "What should I type?",
  "I have not done much calculation on this",
  "I will pass this one",
  "Kinesis, Lambda, S3, Glue Database and Crawler, and Atehna",
  "maybe Kinesis or Lambda",
  "GPS and Delivery",
  "1 ping per 10 sec per vehicle, and deleivery whenever happens",
  "It's a simple calculation. I don't have a calculator",
  "Yes",
  "s3 is 0.23 dollars per gb per month",
  "I guess very small, less than a kb",
  "yes",
  "I guess per shard, and we may need only oen shard because max 1000 records can be processed / sec and we have much less than that",
  "I guess it would be less than 50",
  "That's up to you but I guess these are compliance queries so probably not many",
  "Thanks james for jumping in. However, I was expecting Marcus to have finished his discussion properly.\nJames - You can answer them quickly running a simple Athena query. We can provide some metadata with the query",
  "Yes, Marcus",
  "Maybe set up some altert",
  "No we have not built but it can be easily added",
  "What do I do now? James you are going to ask something?",
  "These are cleaned data coming from raw data, and it's organized in Glue DB catalog",
  "Yes, it's partitioned by day",
  "We can connect them using joins in sql query, but I don't remember the exact query",
  "filter by the vehicle id, and use day partition, and the fields would be delivery time",
  "Ohh I meant package id but I see we can also use vehicle ids location",
  "it's within a few seconds",
  "parquet format with partitions",
  "we can also show the raw data",
  "can we lock the raw data files from editing, or maybe keep versions",
  "need to be added",
  "I honestly don't know",
  "I agree but this is beyond the scope of what we told",
  "Priya, do you want to ask?",
  "Priya - are you sure this question is valid for 358?",
  "I think that data will stay on the stream for soemtime and then will drop",
  "it depends on whether it is set to trim horizon or latest or specific time point",
  "I would say trim horizon",
  "The lambda will quarantine it soemwhere?",
  "I don't remember whether we built soemthing like that",
  "that would break the lambda and maybe nothing else in that batch would process",
  "I don't know",
  "I set the scope of the folder correctly for even notification",
  "The source of the event folder is specified and is different from the destination folder",
  "I don't remember",
  "So am I done?",
  "I thought you would know my name",
  "You don't know who I am?",
  "localbadm358",
  "So am I done?",
  "anyone?",
  "James/ priya? are you good too?",
  "Priya ?",
  "So am I done?",
  "Thank you.",
];

interface Cookie {
  name: string;
  value: string;
}

const cookies: Map<string, string> = new Map();

function cookieHeader(): string {
  return Array.from(cookies.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

function captureSetCookies(res: Response) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const sc of raw) {
    const [pair] = sc.split(";");
    const eq = pair.indexOf("=");
    if (eq < 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    cookies.set(name, value);
  }
}

async function fetchJson(path: string, init: RequestInit = {}): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Cookie: cookieHeader(),
    },
    redirect: "manual",
  });
  captureSetCookies(res);
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* ignore */
  }
  return { status: res.status, json };
}

async function fetchRaw(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Cookie: cookieHeader(),
    },
    redirect: "manual",
  });
  captureSetCookies(res);
  return res;
}

async function login() {
  // Get CSRF
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  captureSetCookies(csrfRes);
  const csrfJson = (await csrfRes.json()) as { csrfToken: string };
  const csrf = csrfJson.csrfToken;

  // Submit credentials
  const body = new URLSearchParams({
    csrfToken: csrf,
    email: EMAIL,
    password: PASSWORD,
    redirect: "false",
    callbackUrl: "/chat",
  });
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieHeader(),
    },
    body,
    redirect: "manual",
  });
  captureSetCookies(res);

  // Verify session
  const session = await fetchJson("/api/auth/session");
  if (!session.json?.user?.email) {
    throw new Error(`Login failed: ${JSON.stringify(session)}`);
  }
  console.log(`Logged in as ${session.json.user.email} (course=${session.json.user.course})`);
}

async function passGate() {
  const res = await fetchJson("/api/final/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: COHORT_PASSWORD }),
  });
  if (res.status !== 200) {
    throw new Error(`Cohort password failed: ${res.status} ${JSON.stringify(res.json)}`);
  }
  console.log("Cohort password accepted; final-auth cookie issued.");
}

async function beginSession(): Promise<string> {
  const res = await fetchJson("/api/final/begin", { method: "POST" });
  if (res.status !== 200 || !res.json?.sessionId) {
    throw new Error(`Begin failed: ${res.status} ${JSON.stringify(res.json)}`);
  }
  console.log(`Session started: ${res.json.sessionId} (resumed=${res.json.resumed})`);
  return res.json.sessionId;
}

async function sendMessage(sessionId: string, content: string, idx: number): Promise<void> {
  const res = await fetchRaw(`/api/final/session/${sessionId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Turn ${idx + 1} send failed: ${res.status} ${text}`);
  }
  // Drain SSE stream until "done" event arrives.
  if (!res.body) throw new Error("No body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let stakeholder = "?";
  let coverageHits: string[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      try {
        const data = JSON.parse(line.slice(5).trim());
        if (data.meta?.stakeholder) stakeholder = data.meta.stakeholder;
        if (data.meta?.coverageCovered?.length) coverageHits = data.meta.coverageCovered;
        if (data.done) {
          // hold until stream closes naturally to avoid race
        }
      } catch {
        /* ignore parse errors on non-json lines */
      }
    }
  }
  const tag = coverageHits.length ? ` [+${coverageHits.join(",")}]` : "";
  console.log(`  turn ${String(idx + 1).padStart(2, " ")} → ${stakeholder}${tag}`);
}

async function endSession(sessionId: string) {
  const res = await fetchJson(`/api/final/session/${sessionId}/end`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason: "student" }),
  });
  console.log(`End session: ${res.status} ${JSON.stringify(res.json)}`);
}

async function fetchScore(sessionId: string) {
  const prisma = new PrismaClient();
  let score = null;
  for (let i = 0; i < 60; i++) {
    score = await prisma.final558Score.findUnique({ where: { sessionId } });
    if (score) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!score) {
    console.log("Grader did not produce a score within 120s.");
    await prisma.$disconnect();
    return;
  }

  const coverage = await prisma.final558Coverage.findMany({
    where: { sessionId },
    orderBy: [{ stakeholder: "asc" }, { point: "asc" }],
  });
  const covMap: Record<string, string[]> = {};
  for (const c of coverage) {
    covMap[c.stakeholder] = covMap[c.stakeholder] ?? [];
    covMap[c.stakeholder].push(c.point);
  }

  console.log("\n=== GRADE ===");
  console.log(`Aggregate: ${score.aggregate} / 100`);
  console.log("\nCoverage tracker:");
  for (const s of ["elena", "marcus", "priya", "james"]) {
    const hits = (covMap[s] ?? []).join(", ") || "(none)";
    console.log(`  ${s.padEnd(8)} ${hits}`);
  }
  console.log("\nGrader output:");
  console.log(score.rawJson);
  await prisma.$disconnect();
}

async function main() {
  await login();
  await passGate();
  const sessionId = await beginSession();
  console.log(`\nReplaying ${STUDENT_TURNS.length} student turns...`);
  for (let i = 0; i < STUDENT_TURNS.length; i++) {
    await sendMessage(sessionId, STUDENT_TURNS[i], i);
  }
  await endSession(sessionId);
  await fetchScore(sessionId);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
