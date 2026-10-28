import { NextRequest, NextResponse } from "next/server";
import { getSession, hasPermission } from "@/lib/auth/auth";
import db from "@/lib/db/db";

export async function GET(req: NextRequest) {
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

    const searchParams = req.nextUrl.searchParams;
    const status = searchParams.get("status");
    const entityType = searchParams.get("entityType");
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const where: any = {};
    if (status && status !== "ALL") where.status = status;
    if (entityType && entityType !== "ALL") where.entityType = entityType;

    const queueItems = await db.tallySyncQueue.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({ success: true, queueItems: queueItems || [] });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch sync queue" },
      { status: 500 }
    );
  }
}
