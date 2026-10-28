import crypto from "crypto";

/** Constant-time check of the Tally Bridge API key. An empty expected key never authenticates. */
export function isValidBridgeKey(provided: string | null | undefined, expected: string | null | undefined): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
