import { NextResponse } from "next/server";
import db from "@/lib/db/db";

export const dynamic = "force-dynamic";

// Liveness + database connectivity probe for the hosting platform's health check.
export async function GET() {
  try {
    await db.$queryRaw`select 1`;
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "database unavailable" }, { status: 503 });
  }
}
