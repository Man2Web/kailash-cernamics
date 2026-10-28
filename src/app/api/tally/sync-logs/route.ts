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
      session.user.roles.includes("SUPER_ADMIN") || (await hasPermission("tally:logs"));
    if (!canView) {
      return NextResponse.json({ error: "Forbidden: insufficient permissions" }, { status: 403 });
    }

    const searchParams = req.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const logs = await db.tallySyncLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({ success: true, logs: logs || [] });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch sync logs" },
      { status: 500 }
    );
  }
}
