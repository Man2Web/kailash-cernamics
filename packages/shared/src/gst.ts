// GST: CGST + SGST for intra-state supply, IGST for inter-state; decided by the branch state code
// versus the place of supply (state code of the buyer / delivery).
import { roundToRupee } from "./money";

export function isInterState(branchStateCode: string, placeOfSupply: string | null | undefined): boolean {
  if (!placeOfSupply) return false;
  return String(branchStateCode).padStart(2, "0") !== String(placeOfSupply).padStart(2, "0");
}

export interface LineInput {
  qtyPcs: number;
  /** per piece (or per unit) rate in paise, before discount, excluding GST */
  ratePaise: number;
  discountPct?: number;
  gstRate: number;
}

export interface LineTotals {
  grossPaise: number;
  discountPaise: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  taxPaise: number;
  amountPaise: number;
}

export function computeLine(line: LineInput, interState: boolean): LineTotals {
  const grossPaise = Math.round(line.qtyPcs * line.ratePaise);
  const discountPaise = Math.round((grossPaise * (line.discountPct || 0)) / 100);
  const taxablePaise = grossPaise - discountPaise;
  let cgstPaise = 0;
  let sgstPaise = 0;
  let igstPaise = 0;
  if (interState) {
    igstPaise = Math.round((taxablePaise * line.gstRate) / 100);
  } else {
    // half-rate each, rounded separately so CGST == SGST always
    cgstPaise = Math.round((taxablePaise * line.gstRate) / 200);
    sgstPaise = cgstPaise;
  }
  const taxPaise = cgstPaise + sgstPaise + igstPaise;
  return { grossPaise, discountPaise, taxablePaise, cgstPaise, sgstPaise, igstPaise, taxPaise, amountPaise: taxablePaise + taxPaise };
}

export interface DocTotals {
  subtotalPaise: number;
  discountPaise: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  chargesPaise: number;
  chargesTaxPaise: number;
  roundOffPaise: number;
  totalPaise: number;
}

/**
 * Totals for a document. Charges (transport, loading) are taxed at `chargesGstRate` (default 18%)
 * following the principal supply, then the grand total is rounded to the nearest rupee.
 */
export function computeDocTotals(
  lines: LineInput[],
  interState: boolean,
  chargesPaise = 0,
  chargesGstRate = 18,
): DocTotals & { lines: LineTotals[] } {
  const computed = lines.map((l) => computeLine(l, interState));
  const sum = (k: keyof LineTotals) => computed.reduce((a, l) => a + l[k], 0);
  const charge = computeLine({ qtyPcs: 1, ratePaise: chargesPaise, gstRate: chargesPaise ? chargesGstRate : 0 }, interState);
  const cgstPaise = sum("cgstPaise") + charge.cgstPaise;
  const sgstPaise = sum("sgstPaise") + charge.sgstPaise;
  const igstPaise = sum("igstPaise") + charge.igstPaise;
  const taxablePaise = sum("taxablePaise");
  const raw = taxablePaise + chargesPaise + cgstPaise + sgstPaise + igstPaise;
  const { total, roundOff } = roundToRupee(raw);
  return {
    lines: computed,
    subtotalPaise: sum("grossPaise"),
    discountPaise: sum("discountPaise"),
    taxablePaise,
    cgstPaise,
    sgstPaise,
    igstPaise,
    chargesPaise,
    chargesTaxPaise: charge.taxPaise,
    roundOffPaise: roundOff,
    totalPaise: total,
  };
}

export const GST_RATES = [0, 5, 12, 18, 28] as const;

export const STATES: { code: string; name: string }[] = [
  { code: "01", name: "Jammu and Kashmir" }, { code: "02", name: "Himachal Pradesh" }, { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" }, { code: "05", name: "Uttarakhand" }, { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" }, { code: "08", name: "Rajasthan" }, { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" }, { code: "11", name: "Sikkim" }, { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" }, { code: "14", name: "Manipur" }, { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" }, { code: "17", name: "Meghalaya" }, { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" }, { code: "20", name: "Jharkhand" }, { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" }, { code: "23", name: "Madhya Pradesh" }, { code: "24", name: "Gujarat" },
  { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu" }, { code: "27", name: "Maharashtra" },
  { code: "29", name: "Karnataka" }, { code: "30", name: "Goa" }, { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" }, { code: "33", name: "Tamil Nadu" }, { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman and Nicobar Islands" }, { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" }, { code: "38", name: "Ladakh" },
];

export function stateName(code: string | null | undefined): string {
  return STATES.find((s) => s.code === String(code ?? "").padStart(2, "0"))?.name ?? "";
}
