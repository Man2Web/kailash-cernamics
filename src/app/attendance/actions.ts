"use server";

import { markEmployeeCheckIn, markEmployeeCheckOut } from "@/lib/attendance/attendance";
import { generateDynamicAttendanceToken, validateAttendanceToken } from "@/lib/attendance/token";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/auth";

async function requireTokenOrSession(token?: string) {
  if (await getSession()) return null;
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

  // A valid rotating QR token is mandatory unless the caller has a valid session
  const denied = await requireTokenOrSession(token);
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

  const denied = await requireTokenOrSession(token);
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
