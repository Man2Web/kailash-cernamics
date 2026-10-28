import { NextRequest, NextResponse } from "next/server";
import { getSession, hasPermission } from "@/lib/auth/auth";
import { getActiveTallyConnection } from "@/lib/tally/sync-service";
import db from "@/lib/db/db";

/**
 * GET: Retrieve active connection configuration & settings (Protected by ERP auth & tally:view)
 */
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

    const { connection, settings } = await getActiveTallyConnection();
    return NextResponse.json({ success: true, connection, settings });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch connection" },
      { status: 500 }
    );
  }
}

/**
 * POST / PATCH: Update connection configuration & settings (Protected by ERP auth & tally:manage / tally:settings)
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const canManage =
      session.user.roles.includes("SUPER_ADMIN") || (await hasPermission("tally:manage"));
    if (!canManage) {
      return NextResponse.json({ error: "Forbidden: insufficient permissions" }, { status: 403 });
    }

    const body = await req.json();
    const { connection, settings } = await getActiveTallyConnection();

    if (body.connection && connection) {
      await db.tallyConnection.update({
        where: { id: connection.id },
        data: {
          name: body.connection.name || connection.name,
          companyName: body.connection.companyName || connection.companyName,
          host: body.connection.host || connection.host,
          port: body.connection.port ? Number(body.connection.port) : connection.port,
          protocol: body.connection.protocol || connection.protocol,
          updatedAt: new Date(),
        },
      });
    }

    if (body.settings && settings) {
      await db.tallySyncSetting.update({
        where: { id: settings.id },
        data: {
          ...body.settings,
          updatedAt: new Date(),
        },
      });
    }

    const updated = await getActiveTallyConnection();
    return NextResponse.json({ success: true, ...updated });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to update connection" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  return POST(req);
}
