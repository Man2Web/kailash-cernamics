// GSTIN: 2-digit state code + 10-char PAN + entity number + 'Z' + checksum (mod 36).

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function gstinChecksum(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = CHARS.indexOf(first14[i]);
    const factor = i % 2 === 0 ? 1 : 2;
    const product = v * factor;
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
}

export function validateGstin(value: string | null | undefined): { valid: boolean; error?: string } {
  if (!value) return { valid: false, error: "GSTIN is required" };
  const g = value.trim().toUpperCase();
  if (g.length !== 15) return { valid: false, error: "GSTIN must be 15 characters" };
  if (!GSTIN_RE.test(g)) return { valid: false, error: "GSTIN format is not valid" };
  if (gstinChecksum(g.slice(0, 14)) !== g[14]) return { valid: false, error: "GSTIN check digit does not match" };
  return { valid: true };
}

export function isValidGstin(value: string | null | undefined): boolean {
  return validateGstin(value).valid;
}

export function stateCodeFromGstin(gstin: string | null | undefined): string | null {
  if (!gstin || gstin.length < 2) return null;
  return gstin.slice(0, 2);
}
