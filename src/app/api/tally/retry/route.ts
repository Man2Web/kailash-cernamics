import { NextRequest, NextResponse } from "next/server";
import { getSession, hasPermission } from "@/lib/auth/auth";
import { retryJob, retryAllFailed, cancelJob } from "@/lib/tally/sync-queue";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const canRetry =
      session.user.roles.includes("SUPER_ADMIN") || (await hasPermission("tally:retry"));
    if (!canRetry) {
      return NextResponse.json({ error: "Forbidden: insufficient permissions" }, { status: 403 });
    }

    const body = await req.json();
    const { action, jobId } = body;

    if (action === "retry-one") {
      if (!jobId) {
        return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
      }
      const result = await retryJob(jobId);
      return NextResponse.json(result);
    }

    if (action === "retry-all") {
      const result = await retryAllFailed();
      return NextResponse.json(result);
    }

    if (action === "cancel") {
      if (!jobId) {
        return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
      }
      const result = await cancelJob(jobId);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to process retry request" },
      { status: 500 }
    );
  }
}
