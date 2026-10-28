import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { purgeExpiredSessions } from "@/lib/auth/auth";
import { purgeOldAttempts } from "@/lib/auth/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Scheduled cleanup of expired sessions and stale login-attempt rows.
 * Call it from your scheduler (e.g. Vercel Cron, GitHub Actions, cron + curl) with
 *   Authorization: Bearer <CRON_SECRET>
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret || "");
  if (!secret || secret.length < 16 || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  await purgeExpiredSessions();
  await purgeOldAttempts();
  return NextResponse.json({ success: true });
}
