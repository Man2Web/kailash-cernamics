import crypto from "crypto";

function getQrSecret(): string {
  const secret = process.env.ATTENDANCE_QR_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("ATTENDANCE_QR_SECRET is not configured (min 16 characters).");
  }
  return secret;
}
const TOKEN_TTL_SECONDS = 60; // 1 minute rotation

interface StoredToken {
  token: string;
  createdAt: number;
  expiresAt: number;
}

// In-memory rotating token store
let currentActiveToken: StoredToken | null = null;
const recentValidTokens = new Map<string, number>(); // token -> expiresAt

/**
 * Generate a new cryptographically secure 60-second rotating attendance token.
 */
export async function generateDynamicAttendanceToken(): Promise<{
  token: string;
  expiresInSeconds: number;
  expiresAt: number;
}> {
  const now = Date.now();

  // If current token is still fresh (> 50s remaining), we can return it, or generate new
  const randomPart = crypto.randomBytes(12).toString("hex");
  const timestamp = now;
  const hash = crypto
    .createHmac("sha256", getQrSecret())
    .update(`${randomPart}:${timestamp}`)
    .digest("hex")
    .slice(0, 16);

  const token = `${randomPart}-${timestamp}-${hash}`;
  const expiresAt = now + TOKEN_TTL_SECONDS * 1000 + 10_000; // 60s + 10s grace

  currentActiveToken = {
    token,
    createdAt: now,
    expiresAt,
  };

  recentValidTokens.set(token, expiresAt);

  // Clean up old expired tokens
  for (const [t, exp] of recentValidTokens.entries()) {
    if (exp < now) {
      recentValidTokens.delete(t);
    }
  }

  return {
    token,
    expiresInSeconds: TOKEN_TTL_SECONDS,
    expiresAt,
  };
}

/**
 * Validates whether an attendance token is valid and currently within its active expiry window.
 */
export async function validateAttendanceToken(token: string): Promise<{
  valid: boolean;
  message?: string;
}> {
  if (!token || typeof token !== "string") {
    return { valid: false, message: "Attendance token is required." };
  }

  const now = Date.now();

  // 1. Check in recent tokens cache
  const cachedExpiry = recentValidTokens.get(token);
  if (cachedExpiry) {
    if (cachedExpiry >= now) {
      return { valid: true };
    } else {
      recentValidTokens.delete(token);
      return { valid: false, message: "QR code expired. Please scan the latest QR code." };
    }
  }

  // 2. Cryptographic signature check
  const parts = token.split("-");
  if (parts.length !== 3) {
    return { valid: false, message: "Invalid attendance token format." };
  }

  const [randomPart, timestampStr, hash] = parts;
  const timestamp = Number(timestampStr);

  if (!timestamp || isNaN(timestamp)) {
    return { valid: false, message: "Invalid token timestamp." };
  }

  // Check TTL (within 70 seconds)
  const ageMs = now - timestamp;
  if (ageMs < 0 || ageMs > (TOKEN_TTL_SECONDS + 10) * 1000) {
    return { valid: false, message: "QR code expired. Please scan the latest QR code." };
  }

  // Verify HMAC signature
  const expectedHash = crypto
    .createHmac("sha256", getQrSecret())
    .update(`${randomPart}:${timestamp}`)
    .digest("hex")
    .slice(0, 16);

  if (hash.length === expectedHash.length && crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expectedHash))) {
    return { valid: true };
  }

  return { valid: false, message: "QR code expired. Please scan the latest QR code." };
}
