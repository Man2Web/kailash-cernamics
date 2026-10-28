import { NextRequest, NextResponse } from "next/server";
import { getSession, hasPermission } from "@/lib/auth/auth";
import { queueAllEntities } from "@/lib/tally/sync-service";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const canSync =
      session.user.roles.includes("SUPER_ADMIN") || (await hasPermission("tally:sync"));
    if (!canSync) {
      return NextResponse.json({ error: "Forbidden: insufficient permissions" }, { status: 403 });
    }

    const body = await req.json();
    const { entityType } = body;

    if (!entityType) {
      return NextResponse.json({ error: "Missing entityType" }, { status: 400 });
    }

    const result = await queueAllEntities(entityType);

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to trigger manual sync" },
      { status: 500 }
    );
  }
}
