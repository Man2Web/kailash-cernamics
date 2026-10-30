// Money is integer paise everywhere. These helpers never go through floats for parsing.

/** Indian digit grouping: 1234567.5 → "12,34,567.50". */
export function formatIndian(value: number, decimals = 2): string {
  const negative = value < 0;
  const fixed = Math.abs(value).toFixed(decimals);
  const [int, frac] = fixed.split(".");
  let grouped = int;
  if (int.length > 3) {
    const last3 = int.slice(-3);
    const rest = int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    grouped = `${rest},${last3}`;
  }
  return `${negative ? "-" : ""}${grouped}${frac !== undefined ? "." + frac : ""}`;
}

export function toPaiseNumber(paise: number | bigint | string | null | undefined): number {
  if (paise === null || paise === undefined || paise === "") return 0;
  return typeof paise === "number" ? paise : Number(paise);
}

/** 123456789 paise → "₹12,34,567.89". */
export function formatINR(paise: number | bigint | string | null | undefined, opts: { symbol?: boolean } = {}): string {
  const p = toPaiseNumber(paise);
  const s = formatIndian(p / 100, 2);
  return opts.symbol === false ? s : `₹${s}`;
}

/** Parse a rupee amount typed by a user ("1,23,456.7") into integer paise without float error. */
export function rupeesToPaise(input: string | number | null | undefined): number {
  if (input === null || input === undefined) return 0;
  const raw = String(input).replace(/[₹,\s]/g, "").trim();
  if (raw === "" || raw === "-") return 0;
  if (!/^-?\d*(\.\d*)?$/.test(raw)) throw new Error(`Invalid amount: ${input}`);
  const negative = raw.startsWith("-");
  const [intPart, fracPart = ""] = raw.replace("-", "").split(".");
  const frac = (fracPart + "000").slice(0, 3);
  // round half up on the third decimal
  let paise = Number(intPart || "0") * 100 + Number(frac.slice(0, 2));
  if (Number(frac[2]) >= 5) paise += 1;
  return negative ? -paise : paise;
}

export function paiseToRupees(paise: number | bigint | string | null | undefined): number {
  return toPaiseNumber(paise) / 100;
}

/** Percentage of an integer paise amount, rounded to the nearest paisa. */
export function pctOf(paise: number, pct: number): number {
  return Math.round((paise * pct) / 100);
}

/** Round a paise total to the nearest rupee; returns the rounded total and the round-off (paise). */
export function roundToRupee(paise: number): { total: number; roundOff: number } {
  const total = Math.round(paise / 100) * 100;
  return { total, roundOff: total - paise };
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? " " + ONES[n % 10] : ""}`;
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", r ? twoDigits(r) : ""].filter(Boolean).join(" ");
}

/** Indian lakh/crore wording: 123456789 paise → "Rupees Twelve Lakh Thirty Four Thousand ... Only". */
export function amountInWords(paise: number): string {
  const rupees = Math.floor(Math.abs(paise) / 100);
  const ps = Math.abs(paise) % 100;
  const parts: string[] = [];
  let n = rupees;
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (n) parts.push(threeDigits(n));
  const words = parts.join(" ") || "Zero";
  return `Rupees ${words}${ps ? ` and ${twoDigits(ps)} Paise` : ""} Only`;
}
