// Dates are stored in UTC and shown in Asia/Kolkata (UTC+05:30, no DST).

const IST_OFFSET_MS = 330 * 60 * 1000;

/** Calendar parts of a UTC instant as seen in India. */
export function istParts(d: Date): { year: number; month: number; day: number } {
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return { year: ist.getUTCFullYear(), month: ist.getUTCMonth() + 1, day: ist.getUTCDate() };
}

/** Indian financial year (April–March) label, e.g. 24 Oct 2026 → "26-27", 10 Feb 2027 → "26-27". */
export function financialYear(d: Date = new Date()): string {
  const { year, month } = istParts(d);
  const start = month >= 4 ? year : year - 1;
  const yy = (n: number) => String(n % 100).padStart(2, "0");
  return `${yy(start)}-${yy(start + 1)}`;
}

/** "KC/CBE/26-27/0001" */
export function formatDocNo(prefix: string, branchCode: string, fy: string, n: number, padding = 4): string {
  return `${prefix}/${branchCode}/${fy}/${String(n).padStart(padding, "0")}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "24 Oct 2026" in IST. */
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  const { year, month, day } = istParts(d);
  return `${String(day).padStart(2, "0")} ${MONTHS[month - 1]} ${year}`;
}

/** "24 Oct 2026, 3:05 pm" in IST. */
export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  const h = ist.getUTCHours();
  const m = String(ist.getUTCMinutes()).padStart(2, "0");
  const h12 = h % 12 || 12;
  return `${formatDate(d)}, ${h12}:${m} ${h < 12 ? "am" : "pm"}`;
}

/** yyyy-mm-dd for <input type="date"> in IST. */
export function toDateInput(value: Date | string | null | undefined = new Date()): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  const { year, month, day } = istParts(d);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Whole days between two instants (b − a), by IST calendar date. */
export function daysBetween(a: Date | string, b: Date | string = new Date()): number {
  const da = new Date(toDateInput(a) + "T00:00:00Z").getTime();
  const db = new Date(toDateInput(b) + "T00:00:00Z").getTime();
  return Math.round((db - da) / 86400000);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86400000);
}

/** Ageing bucket label for outstanding: 0-30, 31-60, 61-90, 90+. */
export function ageingBucket(days: number): "0-30" | "31-60" | "61-90" | "90+" {
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}
