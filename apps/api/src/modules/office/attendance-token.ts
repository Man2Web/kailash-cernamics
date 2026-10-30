import crypto from "node:crypto";

// Rotating, stateless attendance QR token: `<random>-<issuedAtMs>-<hmac>`. It is valid for 60 seconds plus a
// 10 second grace, can only be minted by the server, and needs no storage, so it works across API instances.

export const TOKEN_TTL_SECONDS = 60;
const GRACE_SECONDS = 10;

function secret(): string {
  const configured = process.env.ATTENDANCE_QR_SECRET;
  if (configured && configured.length >= 16) return configured;
  const base = process.env.JWT_ACCESS_SECRET;
  if (!base) throw new Error("ATTENDANCE_QR_SECRET (min 16 characters) or JWT_ACCESS_SECRET must be set.");
  return crypto.createHmac("sha256", base).update("attendance-qr").digest("hex");
}

function sign(random: string, issuedAt: number): string {
  return crypto.createHmac("sha256", secret()).update(`${random}:${issuedAt}`).digest("hex").slice(0, 16);
}

export function issueAttendanceToken(now = Date.now()) {
  const random = crypto.randomBytes(12).toString("hex");
  return {
    token: `${random}-${now}-${sign(random, now)}`,
    expiresInSeconds: TOKEN_TTL_SECONDS,
    expiresAt: now + (TOKEN_TTL_SECONDS + GRACE_SECONDS) * 1000,
  };
}

export function verifyAttendanceToken(token: string, now = Date.now()): { valid: boolean; message?: string } {
  if (!token || typeof token !== "string") return { valid: false, message: "Attendance token is required." };
  const parts = token.split("-");
  if (parts.length !== 3) return { valid: false, message: "Invalid attendance QR code." };
  const [random, issuedStr, hash] = parts;
  const issuedAt = Number(issuedStr);
  if (!Number.isFinite(issuedAt) || issuedAt <= 0) return { valid: false, message: "Invalid attendance QR code." };
  const expected = sign(random, issuedAt);
  const a = Buffer.from(hash);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { valid: false, message: "Invalid attendance QR code." };
  const age = now - issuedAt;
  if (age < -5_000 || age > (TOKEN_TTL_SECONDS + GRACE_SECONDS) * 1000) {
    return { valid: false, message: "QR code expired. Please scan the latest QR code." };
  }
  return { valid: true };
}
