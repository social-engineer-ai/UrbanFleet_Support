import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await prisma.user.count();
    return Response.json({ status: "ok", timestamp: new Date().toISOString() });
  } catch {
    return Response.json({ status: "error", message: "Database unreachable" }, { status: 500 });
  }
}
