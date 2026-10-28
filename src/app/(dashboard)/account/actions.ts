"use server";

import { revalidatePath } from "next/cache";
import db from "@/lib/db/db";
import { getSession, comparePassword, hashPassword } from "@/lib/auth/auth";
import { accountKey, getClientIp, isThrottled, recordFailure, clearFailures, THROTTLE_MESSAGE } from "@/lib/auth/rate-limit";

// The password every new member starts with until they change it.
const DEFAULT_PASSWORD = "Inventory@123";

/** Lets a signed-in member change their own password (they must know the current one). */
export async function changeMyPasswordAction(currentPassword: string, newPassword: string, confirmPassword: string) {
  const session = await getSession();
  if (!session) return { error: "Please log in again." };

  if (!currentPassword || !newPassword || !confirmPassword) return { error: "Please fill in all three password fields." };
  if (newPassword !== confirmPassword) return { error: "The new password and its confirmation do not match." };
  if (newPassword.length < 8) return { error: "The new password must be at least 8 characters long." };
  if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    return { error: "Use at least one letter and one number in the new password." };
  }
  if (newPassword === currentPassword) return { error: "The new password must be different from the current one." };
  if (newPassword === DEFAULT_PASSWORD) return { error: "Please choose your own password, not the default one." };

  // Guess protection: failed attempts to confirm the current password are throttled like a login.
  const acctKey = accountKey("pw:" + session.user.id);
  const ipKey = "ip:" + (await getClientIp());
  if (await isThrottled(acctKey, ipKey)) return { error: THROTTLE_MESSAGE };

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (!user || !(await comparePassword(currentPassword, user.passwordHash))) {
    await recordFailure(acctKey, ipKey);
    return { error: "The current password is not correct." };
  }

  const passwordHash = await hashPassword(newPassword);
  await db.user.update({ where: { id: user.id }, data: { passwordHash } });
  await clearFailures(acctKey);

  // Anyone else signed in with the old password is signed out; this device stays signed in.
  await db.session.deleteMany({ where: { userId: user.id, id: { not: session.sessionId } } });

  revalidatePath("/account");
  return { success: true, message: "Your password has been changed. Other devices were signed out." };
}

/** Signs this member out everywhere except the device they are using. */
export async function signOutOtherDevicesAction() {
  const session = await getSession();
  if (!session) return { error: "Please log in again." };
  await db.session.deleteMany({ where: { userId: session.user.id, id: { not: session.sessionId } } });
  revalidatePath("/account");
  return { success: true, message: "Signed out of all other devices." };
}

/** Lets a member update their own name and mobile number. */
export async function updateMyProfileAction(name: string, phone: string) {
  const session = await getSession();
  if (!session) return { error: "Please log in again." };

  const cleanName = (name || "").trim();
  const cleanPhone = (phone || "").replace(/\s+/g, "");
  if (cleanName.length < 2 || cleanName.length > 80) return { error: "Please enter your full name (2 to 80 characters)." };
  if (cleanPhone && !/^\+?[0-9]{10,13}$/.test(cleanPhone)) return { error: "Enter a valid mobile number (10 to 13 digits)." };

  const employee = await db.employee.findFirst({ where: { email: session.user.email } });
  if (cleanPhone) {
    const taken = await db.employee.findFirst({ where: { phone: cleanPhone } });
    if (taken && (!employee || taken.id !== employee.id)) {
      return { error: "That mobile number is already registered to another employee." };
    }
  }

  await db.$transaction(async (tx: any) => {
    await tx.user.update({ where: { id: session.user.id }, data: { name: cleanName } });
    if (employee) {
      await tx.employee.update({ where: { id: employee.id }, data: { name: cleanName, phone: cleanPhone || null } });
    }
  });

  revalidatePath("/profile");
  return {
    success: true,
    message: employee || !cleanPhone ? "Your profile has been updated." : "Name updated. Your mobile number can only be saved for staff with an employee record.",
  };
}
