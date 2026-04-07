import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const BUCKET_NAME = process.env.DUMP_S3_BUCKET || "stakeholdersim-data";
const AWS_REGION = process.env.AWS_REGION || "us-east-1";

function getS3Client() {
  return new S3Client({
    region: AWS_REGION,
    credentials: process.env.AWS_ACCESS_KEY_ID
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
        }
      : undefined,
  });
}

// POST: Dump all conversations to S3 (and return as JSON)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || user.role !== "instructor") {
    return Response.json({ error: "Instructor access required" }, { status: 403 });
  }

  const { uploadToS3 } = await req.json().catch(() => ({ uploadToS3: false }));

  // Gather all data
  const students = await prisma.user.findMany({
    where: { role: "student", emailVerified: true },
    orderBy: { name: "asc" },
    include: {
      studentState: { select: { stateJson: true, updatedAt: true } },
      conversations: {
        orderBy: { startedAt: "asc" },
        include: {
          messages: {
            where: { role: { not: "system" } },
            orderBy: { timestamp: "asc" },
            select: { role: true, content: true, metadata: true, timestamp: true },
          },
        },
      },
    },
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  // Build the dump — one JSON object per student, structured for LLM analysis
  const dump = students.map((s) => ({
    student: {
      id: s.id,
      name: s.name,
      email: s.email,
      course: s.course,
      teamId: s.teamId,
      registeredAt: s.createdAt.toISOString(),
    },
    state: s.studentState ? JSON.parse(s.studentState.stateJson) : null,
    stateUpdatedAt: s.studentState?.updatedAt?.toISOString() || null,
    conversations: s.conversations.map((c) => ({
      id: c.id,
      agentType: c.agentType,
      persona: c.persona,
      startedAt: c.startedAt.toISOString(),
      endedAt: c.endedAt?.toISOString() || null,
      summary: c.summary,
      messageCount: c.messageCount,
      messages: c.messages.map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp.toISOString(),
        metadata: m.metadata ? JSON.parse(m.metadata) : null,
      })),
    })),
    summary: {
      totalConversations: s.conversations.length,
      clientMeetings: s.conversations.filter((c) => c.agentType === "client").length,
      mentorSessions: s.conversations.filter((c) => c.agentType === "mentor").length,
      totalMessages: s.conversations.reduce((sum, c) => sum + c.messageCount, 0),
      personasMet: [...new Set(s.conversations.filter((c) => c.agentType === "client").map((c) => c.persona))],
    },
  }));

  // Full dump as a single JSON
  const fullDump = {
    exportedAt: new Date().toISOString(),
    exportedBy: user.email,
    studentCount: dump.length,
    totalConversations: dump.reduce((sum, d) => sum + d.conversations.length, 0),
    students: dump,
  };

  const jsonContent = JSON.stringify(fullDump, null, 2);

  // Upload to S3 if requested
  let s3Result = null;
  if (uploadToS3) {
    try {
      const s3 = getS3Client();

      // Upload full dump
      const fullKey = `dumps/${timestamp}/full_dump.json`;
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: fullKey,
        Body: jsonContent,
        ContentType: "application/json",
      }));

      // Upload per-student files for easier LLM querying
      for (const studentData of dump) {
        const studentKey = `dumps/${timestamp}/students/${studentData.student.email.replace("@", "_at_")}.json`;
        await s3.send(new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: studentKey,
          Body: JSON.stringify(studentData, null, 2),
          ContentType: "application/json",
        }));
      }

      // Upload a conversations-only file (just transcripts, easier for LLM analysis)
      const transcriptsOnly = dump.flatMap((s) =>
        s.conversations.map((c) => ({
          student: s.student.name,
          email: s.student.email,
          course: s.student.course,
          agentType: c.agentType,
          persona: c.persona,
          date: c.startedAt,
          transcript: c.messages
            .map((m) => `${m.role === "user" ? "STUDENT" : "AGENT"}: ${m.content}`)
            .join("\n\n"),
        }))
      );

      const transcriptsKey = `dumps/${timestamp}/transcripts_only.jsonl`;
      const transcriptsContent = transcriptsOnly.map((t) => JSON.stringify(t)).join("\n");
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: transcriptsKey,
        Body: transcriptsContent,
        ContentType: "application/x-ndjson",
      }));

      s3Result = {
        bucket: BUCKET_NAME,
        prefix: `dumps/${timestamp}/`,
        files: [
          `dumps/${timestamp}/full_dump.json`,
          `dumps/${timestamp}/transcripts_only.jsonl`,
          ...dump.map((d) => `dumps/${timestamp}/students/${d.student.email.replace("@", "_at_")}.json`),
        ],
      };
    } catch (error) {
      console.error("S3 upload error:", error);
      s3Result = { error: String(error) };
    }
  }

  return Response.json({
    success: true,
    studentCount: dump.length,
    totalConversations: fullDump.totalConversations,
    s3: s3Result,
    // Include the dump inline for download (truncated if massive)
    downloadAvailable: true,
  });
}

// GET: Download the full dump as JSON file
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || user.role !== "instructor") {
    return Response.json({ error: "Instructor access required" }, { status: 403 });
  }

  const students = await prisma.user.findMany({
    where: { role: "student", emailVerified: true },
    orderBy: { name: "asc" },
    include: {
      studentState: { select: { stateJson: true } },
      conversations: {
        orderBy: { startedAt: "asc" },
        include: {
          messages: {
            where: { role: { not: "system" } },
            orderBy: { timestamp: "asc" },
            select: { role: true, content: true, timestamp: true },
          },
        },
      },
    },
  });

  const dump = students.map((s) => ({
    student: { name: s.name, email: s.email, course: s.course },
    state: s.studentState ? JSON.parse(s.studentState.stateJson) : null,
    conversations: s.conversations.map((c) => ({
      agentType: c.agentType,
      persona: c.persona,
      startedAt: c.startedAt.toISOString(),
      endedAt: c.endedAt?.toISOString() || null,
      summary: c.summary,
      messages: c.messages.map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp.toISOString(),
      })),
    })),
  }));

  const jsonContent = JSON.stringify(dump, null, 2);

  return new Response(jsonContent, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="stakeholdersim_dump_${new Date().toISOString().split("T")[0]}.json"`,
    },
  });
}
