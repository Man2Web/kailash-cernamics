import { NextRequest, NextResponse } from "next/server";
import {
  markEmployeeCheckIn,
  markEmployeeCheckOut,
  getEmployeeTodayAttendanceStatus,
  normalizePhoneNumber,
} from "@/lib/attendance/attendance";
import { validateAttendanceToken } from "@/lib/attendance/token";
import { getSession, isSuperAdmin, type UserSession } from "@/lib/auth/auth";

export const dynamic = "force-dynamic";

/**
 * Access policy
 * - Public kiosk flow (intentional): an employee scans the office QR and enters their mobile number.
 *   Every request in this flow MUST carry a valid, unexpired rotating QR token (header `x-attendance-token`,
 *   `?token=` or body `token`). No token => 401.
 * - Authenticated flow: a valid server-side session. Users may act on their own record; acting on another
 *   employee's record needs an admin role or the `attendance:manage` permission.
 */

type Caller =
  | { kind: "session"; session: UserSession }
  | { kind: "public" };

function unauthorized(message = "Authentication required.") {
  return NextResponse.json({ success: false, message }, { status: 401 });
}

async function resolveCaller(request: NextRequest, bodyToken?: string): Promise<Caller | NextResponse> {
  // Attendance needs a signed-in member (username and password).
  const session = await getSession();
  if (!session) return unauthorized("Please log in with your username and password.");

  // Staff must also present the current rotating QR token (attendance managers / Super Admins are exempt).
  if (!isSuperAdmin(session.user.roles) && !session.user.permissions.includes("attendance:manage")) {
    const token =
      request.headers.get("x-attendance-token") ||
      new URL(request.url).searchParams.get("token") ||
      bodyToken ||
      "";
    const check = await validateAttendanceToken(token);
    if (!check.valid) {
      return unauthorized(check.message || "QR code expired. Please scan the latest QR code.");
    }
  }
  return { kind: "session", session };
}

function canAccessIdentifier(session: UserSession, identifier: string): boolean {
  if (isSuperAdmin(session.user.roles) || session.user.permissions.includes("attendance:manage")) return true;
  const id = identifier.trim().toLowerCase();
  const own = [session.user.employeeNo, session.user.email, session.user.phone]
    .filter(Boolean)
    .map((v) => String(v).trim().toLowerCase());
  if (own.includes(id)) return true;
  const norm = normalizePhoneNumber(identifier);
  return !!session.user.phone && norm.length >= 10 && normalizePhoneNumber(session.user.phone) === norm;
}

/** Public callers only get today's state and times - never ids, phone numbers or other profile data. */
function minimalStatus(res: Awaited<ReturnType<typeof getEmployeeTodayAttendanceStatus>>) {
  if (!res.success) {
    // Same shape as "not checked in" so the lookup cannot be used to enumerate registered numbers.
    return { success: true, state: "NOT_CHECKED_IN" as const, record: null };
  }
  return { success: true, state: res.state, record: res.record ?? null };
}

export async function GET(request: NextRequest) {
  try {
    const caller = await resolveCaller(request);
    if (caller instanceof NextResponse) return caller;

    const { searchParams } = new URL(request.url);
    const identifier = (searchParams.get("identifier") || searchParams.get("phone") || searchParams.get("mobile") || "").trim();
    if (!identifier) {
      return NextResponse.json(
        { success: false, state: "NOT_CHECKED_IN", message: "Identifier is required." },
        { status: 400 }
      );
    }

    if (caller.kind === "session" && !canAccessIdentifier(caller.session, identifier)) {
      return NextResponse.json({ success: false, message: "Forbidden." }, { status: 403 });
    }

    const res = await getEmployeeTodayAttendanceStatus(identifier);
    if (caller.kind === "public") return NextResponse.json(minimalStatus(res), { status: 200 });
    return NextResponse.json(res, { status: res.success ? 200 : 400 });
  } catch (error) {
    console.error("API /api/attendance GET error:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json(
      { success: false, state: "NOT_CHECKED_IN", message: "Failed to get attendance status." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const caller = await resolveCaller(request, typeof body.token === "string" ? body.token : undefined);
    if (caller instanceof NextResponse) return caller;

    const identifier = String(body.mobile || body.phone || body.identifier || body.employeeNo || "").trim();
    const actionType = String(body.action || "CHECK_IN").toUpperCase();

    if (!identifier) {
      return NextResponse.json({ success: false, message: "Please enter your mobile number." }, { status: 400 });
    }

    if (caller.kind === "session" && !canAccessIdentifier(caller.session, identifier)) {
      return NextResponse.json({ success: false, message: "Forbidden." }, { status: 403 });
    }

    if (actionType === "STATUS") {
      const res = await getEmployeeTodayAttendanceStatus(identifier);
      return NextResponse.json(caller.kind === "public" ? minimalStatus(res) : res, { status: 200 });
    }

    if (actionType === "CHECK_OUT") {
      const result = await markEmployeeCheckOut({ identifier });
      return NextResponse.json(result, { status: result.success ? 200 : 400 });
    }
    const result = await markEmployeeCheckIn({ identifier, method: "QR" });
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    console.error("API /api/attendance POST error:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json(
      { success: false, message: "Unable to mark attendance. Please try again." },
      { status: 500 }
    );
  }
}
