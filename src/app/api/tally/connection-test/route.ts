import { NextRequest, NextResponse } from "next/server";
import { getActiveTallyConnection } from "@/lib/tally/sync-service";
import { isValidBridgeKey } from "@/lib/tally/bridge-auth";
import db from "@/lib/db/db";

export async function GET(req: NextRequest) {
  try {
    const bridgeKey = req.headers.get("x-tally-bridge-key");
    const { connection, settings } = await getActiveTallyConnection();

    if (bridgeKey) {
      if (!isValidBridgeKey(bridgeKey, connection.apiKey)) {
        return NextResponse.json(
          { error: "Invalid Tally Bridge API Key" },
          { status: 401 }
        );
      }

      // Update ping timestamp & status
      await db.tallyConnection.update({
        where: { id: connection.id },
        data: {
          lastPingAt: new Date(),
          status: "ONLINE",
        },
      });

      return NextResponse.json({
        success: true,
        message: "Tally Bridge successfully connected",
        connection: {
          name: connection.name,
          companyName: connection.companyName,
          mode: connection.integrationMode,
          status: "ONLINE",
        },
        settings,
      });
    }

    // Default status for UI test
    return NextResponse.json({
      success: true,
      connection,
      settings,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to test connection" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { connection } = await getActiveTallyConnection();

    // Update connection status
    if (body.status) {
      await db.tallyConnection.update({
        where: { id: connection.id },
        data: {
          status: body.status,
          lastPingAt: new Date(),
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: "Connection updated successfully",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to update connection" },
      { status: 500 }
    );
  }
}
