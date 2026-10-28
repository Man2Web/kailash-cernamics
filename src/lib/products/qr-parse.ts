/** Pure helpers for reading scanned product QR values (no DB access, unit-testable). */

export type ScanKind = "product-token" | "attendance" | "other";

/** Classify a scanned/typed value. Product QR tokens look like PROD-QR-<token>. */
export function classifyScan(raw: string): { kind: ScanKind; value: string } {
  const value = (raw || "").trim();
  if (/^PROD-QR-[A-Z0-9_-]{4,64}$/i.test(value)) return { kind: "product-token", value: value.toUpperCase() };
  if (/\/attendance(\?|$|\/)/i.test(value) || /^ATT[-_:]/i.test(value)) return { kind: "attendance", value };
  return { kind: "other", value };
}
