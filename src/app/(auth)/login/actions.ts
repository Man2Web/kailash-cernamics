"use server";

import { z } from "zod";
import { db } from "@/lib/db/db";
import { comparePassword, createSession } from "@/lib/auth/auth";
import {
  THROTTLE_MESSAGE,
  accountKey,
  clearFailures,
  getClientIp,
  isThrottled,
  purgeOldAttempts,
  recordFailure,
} from "@/lib/auth/rate-limit";

const GENERIC_AUTH_ERROR = "Invalid email/phone or password.";

const loginSchema = z.object({
  identifier: z.string().min(1, "Please enter your email or phone number."),
  password: z.string().min(6, "Password must be at least 6 characters."),
});

export type LoginState = {
  success?: boolean;
  error?: string;
};

export async function loginAction(prevState: any, formData: FormData): Promise<LoginState> {
  const identifier = ((formData.get("identifier") || formData.get("email")) as string || "").trim();
  const password = (formData.get("password") as string || "").trim();

  // 1. Validate fields
  const validation = loginSchema.safeParse({ identifier, password });
  if (!validation.success) {
    return { error: validation.error.issues[0].message };
  }

  const acctKey = accountKey(identifier);
  const ipKey = "ip:" + (await getClientIp());

  if (await isThrottled(acctKey, ipKey)) {
    return { error: THROTTLE_MESSAGE };
  }

  try {
    // 2. Find user by email or by phone in employees
    let user = null;

    if (identifier.includes("@")) {
      user = await db.user.findUnique({
        where: { email: identifier.toLowerCase() },
      });
    } else {
      // Look up by phone in employees table
      const employee = await db.employee.findFirst({
        where: { phone: identifier },
      });
      if (employee && employee.email) {
        user = await db.user.findUnique({
          where: { email: employee.email.toLowerCase() },
        });
      }
      // If still not found, check if email was stored as phone@...
      if (!user) {
        user = await db.user.findFirst({
          where: { email: `${identifier.replace(/\D/g, "")}@inventory.local` },
        });
      }
      if (!user) {
        // Also try email matching identifier directly
        user = await db.user.findFirst({
          where: { email: identifier.toLowerCase() },
        });
      }
    }

    // Always run a bcrypt comparison so response time does not reveal whether the account exists
    const DUMMY_HASH = "$2b$10$Lk146Mr4TCRbt1AQjWVC1OPiJuTjg4k31dKQ5uKiPmj4/5HDUZ9um"; // valid bcrypt hash of a throwaway value
    const isPasswordValid = await comparePassword(password, user?.passwordHash || DUMMY_HASH);

    // Same generic error for unknown user, wrong password and inactive account (no account enumeration)
    if (!user || !isPasswordValid || user.status !== "ACTIVE") {
      await recordFailure(acctKey, ipKey);
      return { error: GENERIC_AUTH_ERROR };
    }

    // 4. Create Session (Sets HTTP-Only Cookie)
    await createSession(user.id);
    await clearFailures(acctKey);
    void purgeOldAttempts();

    return { success: true };
  } catch (error) {
    console.error("Login Server Action Error:", error instanceof Error ? error.message : "unknown");
    return { error: "A database or system error occurred. Please try again." };
  }
}

