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
    const entityType = searchParams.get("entityType");

    const where: any = {};
    if (entityType && entityType !== "ALL") {
      where.entityType = entityType;
    }

    const mappings = await db.tallyEntityMapping.findMany({
      where,
      orderBy: { lastSyncedAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      mappings: mappings || [],
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch mappings" },
      { status: 500 }
    );
  }
}

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
    const { entityType, entityId, entityCode, entityName, tallyGuid, tallyName } = body;

    if (!entityType || !entityId || !tallyName) {
      return NextResponse.json(
        { error: "Missing required mapping fields" },
        { status: 400 }
      );
    }

    const existing = await db.tallyEntityMapping.findFirst({
      where: { entityType, entityId },
    });

    let result;
    if (existing) {
      result = await db.tallyEntityMapping.update({
        where: { id: existing.id },
        data: {
          entityCode: entityCode || existing.entityCode,
          entityName: entityName || existing.entityName,
          tallyGuid: tallyGuid || existing.tallyGuid,
          tallyName,
          syncStatus: "MANUALLY_LINKED",
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        },
      });
    } else {
      result = await db.tallyEntityMapping.create({
        data: {
          entityType,
          entityId,
          entityCode: entityCode || null,
          entityName: entityName || null,
          tallyGuid: tallyGuid || null,
          tallyName,
          syncStatus: "MANUALLY_LINKED",
          lastSyncedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to update mapping" },
      { status: 500 }
    );
  }
}
