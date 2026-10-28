import { NextResponse } from "next/server";
import { getSession, hasPermission } from "@/lib/auth/auth";
import { getTallySyncStats } from "@/lib/tally/sync-status";
import db from "@/lib/db/db";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const canView =
      session.user.roles.includes("SUPER_ADMIN") || (await hasPermission("tally:view"));
    if (!canView) {
      return NextResponse.json({ error: "Forbidden: insufficient permissions" }, { status: 403 });
    }

    const stats = await getTallySyncStats();

    // Fetch latest 50 queue items for UI table with fallback
    let queueItems: any[] = [];
    try {
      queueItems = await db.tallySyncQueue.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
      });
    } catch (err) {
      console.warn("Could not fetch tallySyncQueue in status route:", err);
    }

    return NextResponse.json({
      ...stats,
      queueItems: queueItems || [],
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch status" },
      { status: 500 }
    );
  }
}
