"use server";

import { markEmployeeCheckIn, markEmployeeCheckOut } from "@/lib/attendance/attendance";
import { generateDynamicAttendanceToken, validateAttendanceToken } from "@/lib/attendance/token";
import { revalidatePath } from "next/cache";
import { getSession, canManageAttendance, isAttendanceDisplay } from "@/lib/auth/auth";
import { normalizePhoneNumber } from "@/lib/attendance/attendance";

/**
 * Marking attendance needs a signed-in member. Members can only mark their own record, and must have scanned the
 * current QR code (valid rotating token). Attendance managers / Super Admins may mark on behalf of staff.
 */
async function requireLoginAndQr(identifier: string, token?: string) {
  const session = await getSession();
  if (!session) {
    return { success: false as const, message: "Please log in with your username and password to mark attendance." };
  }
  if (canManageAttendance(session)) return null;

  const id = identifier.trim().toLowerCase();
  const own = [session.user.employeeNo, session.user.email, session.user.phone]
    .filter(Boolean)
    .map((v) => String(v).trim().toLowerCase());
  const norm = normalizePhoneNumber(identifier);
  const isOwn =
    own.includes(id) || (!!session.user.phone && norm.length >= 10 && normalizePhoneNumber(session.user.phone) === norm);
  if (!isOwn) {
    return { success: false as const, message: "You can only mark your own attendance." };
  }

  const tokenCheck = await validateAttendanceToken(token || "");
  if (!tokenCheck.valid) {
    return {
      success: false as const,
      message: tokenCheck.message || "QR code expired. Please scan the latest QR code.",
    };
  }
  return null;
}

/**
 * Generates a fresh 60-second rotating attendance token for the QR display.
 */
export async function getLiveAttendanceTokenAction() {
  const session = await getSession();
  if (!isAttendanceDisplay(session)) {
    // Anyone else (logged out, staff, Super Admin) must not be able to mint a code remotely.
    return { token: "", expiresInSeconds: 0, expiresAt: 0, error: "Only the attendance QR screen login can show the code." };
  }
  return generateDynamicAttendanceToken();
}

/**
 * Validates a scanned QR token before showing check-in form.
 */
export async function verifyScannedTokenAction(token: string) {
  return validateAttendanceToken(token);
}

/**
 * Mark Check-In with token validation and duplicate check.
 */
export async function checkInEmployeeAction(identifier: string, token?: string) {
  const cleanId = (identifier || "").trim();
  if (!cleanId) {
    return {
      success: false,
      message: "Please enter your mobile number.",
    };
  }

  const denied = await requireLoginAndQr(cleanId, token);
  if (denied) return denied;

  const res = await markEmployeeCheckIn({ identifier: cleanId, method: "QR" });
  try {
    revalidatePath("/attendance");
    revalidatePath("/office/attendance");
  } catch {
    // Ignore in non-HTTP / CLI context
  }
  return res;
}

/**
 * Mark Check-Out with token validation.
 */
export async function checkOutEmployeeAction(identifier: string, token?: string) {
  const cleanId = (identifier || "").trim();
  if (!cleanId) {
    return {
      success: false,
      message: "Please enter your mobile number.",
    };
  }

  const denied = await requireLoginAndQr(cleanId, token);
  if (denied) return denied;

  const res = await markEmployeeCheckOut({ identifier: cleanId });
  try {
    revalidatePath("/attendance");
    revalidatePath("/office/attendance");
  } catch {
    // Ignore in non-HTTP / CLI context
  }
  return res;
}
