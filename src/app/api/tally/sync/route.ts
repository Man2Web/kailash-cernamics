import { NextRequest, NextResponse } from "next/server";
import {
  claimNextPendingJobs,
  markJobSuccess,
  markJobFailed,
} from "@/lib/tally/sync-queue";
import { getActiveTallyConnection } from "@/lib/tally/sync-service";
import { isValidBridgeKey } from "@/lib/tally/bridge-auth";

/**
 * GET: Claim pending sync jobs for the local Tally Bridge
 */
export async function GET(req: NextRequest) {
  try {
    const bridgeKey = req.headers.get("x-tally-bridge-key");
    const { connection, settings } = await getActiveTallyConnection();

    if (!isValidBridgeKey(bridgeKey, connection.apiKey)) {
      return NextResponse.json(
        { error: "Unauthorized Tally Bridge request. Missing or invalid API key." },
        { status: 401 }
      );
    }

    if (settings && !settings.autoSync) {
      return NextResponse.json({
        success: true,
        jobs: [],
        message: "Auto sync is currently disabled in ERP settings",
      });
    }

    const searchParams = req.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const lockedBy = searchParams.get("workerId") || "local-tally-bridge";

    const result = await claimNextPendingJobs({
      limit,
      lockedBy,
      leaseSeconds: 300,
    });

    return NextResponse.json({
      success: true,
      jobs: result.jobs || [],
    });
  } catch (error: any) {
    console.error("Error in GET /api/tally/sync:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch sync jobs" },
      { status: 500 }
    );
  }
}

/**
 * POST: Local Bridge reports execution results
 */
export async function POST(req: NextRequest) {
  try {
    const bridgeKey = req.headers.get("x-tally-bridge-key");
    const { connection } = await getActiveTallyConnection();

    if (!isValidBridgeKey(bridgeKey, connection.apiKey)) {
      return NextResponse.json(
        { error: "Unauthorized Tally Bridge request" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const {
      jobId,
      success,
      tallyGuid,
      tallyName,
      tallyVoucherNo,
      requestXml,
      responseXml,
      responseJson,
      errorMessage,
      durationMs,
    } = body;

    if (!jobId) {
      return NextResponse.json({ error: "Missing required jobId" }, { status: 400 });
    }

    if (success) {
      const result = await markJobSuccess({
        jobId,
        tallyGuid,
        tallyName,
        tallyVoucherNo,
        requestXml,
        responseXml,
        responseJson,
        durationMs,
      });
      return NextResponse.json(result);
    } else {
      const result = await markJobFailed({
        jobId,
        errorMessage: errorMessage || "Unknown error reported by Tally Bridge",
        requestXml,
        responseXml,
        durationMs,
      });
      return NextResponse.json(result);
    }
  } catch (error: any) {
    console.error("Error in POST /api/tally/sync:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process sync result" },
      { status: 500 }
    );
  }
}
