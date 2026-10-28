import crypto from "crypto";
import { headers } from "next/headers";
import { db } from "@/lib/db/db";

/**
 * Login throttling backed by the shared Postgres database (table `login_attempts`), so counters
 * survive restarts and are shared across serverless instances. Requires the
 * 20261023000000_login_attempts migration to be applied.
 *
 * Only FAILED attempts are recorded; a successful login clears the account counter, and old rows expire
 * naturally as the window slides, so legitimate users are never locked out permanently.
 */
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const MAX_FAILURES_PER_ACCOUNT = 5;
export const MAX_FAILURES_PER_IP = 30;

export const THROTTLE_MESSAGE = "Too many failed attempts. Please wait a few minutes and try again.";

export function accountKey(identifier: string): string {
  return "id:" + crypto.createHash("sha256").update(identifier.trim().toLowerCase()).digest("hex");
}

export async function getClientIp(): Promise<string> {
  try {
    const h = await headers();
    const fwd = h.get("x-forwarded-for");
    return (fwd ? fwd.split(",")[0] : h.get("x-real-ip") || "unknown").trim().slice(0, 64);
  } catch {
    return "unknown";
  }
}

async function recentFailures(key: string): Promise<number> {
  const rows = await db.loginAttempt.findMany({
    where: { key, createdAt: { gte: new Date(Date.now() - LOGIN_WINDOW_MS) } },
    take: 100,
  });
  return rows.length;
}

/** Returns true when this account or IP is currently throttled. */
export async function isThrottled(acctKey: string, ipKey: string): Promise<boolean> {
  try {
    const [acct, ip] = await Promise.all([recentFailures(acctKey), recentFailures(ipKey)]);
    return acct >= MAX_FAILURES_PER_ACCOUNT || ip >= MAX_FAILURES_PER_IP;
  } catch (error) {
    // Store unavailable (e.g. migration not applied). Fail open so login keeps working, but be loud.
    console.error("[rate-limit] store unavailable, login throttling INACTIVE:", error instanceof Error ? error.message : "unknown");
    return false;
  }
}

export async function recordFailure(acctKey: string, ipKey: string): Promise<void> {
  try {
    await db.loginAttempt.create({ data: { key: acctKey } });
    await db.loginAttempt.create({ data: { key: ipKey } });
  } catch (error) {
    console.error("[rate-limit] could not record failure:", error instanceof Error ? error.message : "unknown");
  }
}

export async function clearFailures(acctKey: string): Promise<void> {
  try {
    await db.loginAttempt.deleteMany({ where: { key: acctKey } });
  } catch {
    // best effort
  }
}

/** Opportunistic cleanup of rows older than the window. */
export async function purgeOldAttempts(): Promise<void> {
  try {
    await db.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - LOGIN_WINDOW_MS) } } });
  } catch {
    // best effort
  }
}
