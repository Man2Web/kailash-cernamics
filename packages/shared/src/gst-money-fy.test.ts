import { describe, expect, it } from "vitest";
import { computeDocTotals, computeLine, isInterState } from "./gst";
import { amountInWords, formatINR, formatIndian, roundToRupee, rupeesToPaise } from "./money";
import { ageingBucket, financialYear, formatDate, formatDocNo } from "./fy";
import { gstinChecksum, validateGstin } from "./gstin";

describe("GST", () => {
  it("decides intra vs inter state by branch state vs place of supply", () => {
    expect(isInterState("33", "33")).toBe(false);
    expect(isInterState("33", "32")).toBe(true);
    expect(isInterState("33", "3")).toBe(true);
  });

  it("splits CGST/SGST equally and IGST for inter-state", () => {
    const intra = computeLine({ qtyPcs: 10, ratePaise: 10000, discountPct: 10, gstRate: 18 }, false);
    expect(intra.taxablePaise).toBe(90000);
    expect(intra.cgstPaise).toBe(8100);
    expect(intra.sgstPaise).toBe(8100);
    expect(intra.igstPaise).toBe(0);
    const inter = computeLine({ qtyPcs: 10, ratePaise: 10000, discountPct: 10, gstRate: 18 }, true);
    expect(inter.igstPaise).toBe(16200);
    expect(inter.cgstPaise + inter.sgstPaise).toBe(0);
  });

  it("totals round to the nearest rupee with round-off", () => {
    const t = computeDocTotals([{ qtyPcs: 3, ratePaise: 21313, gstRate: 18 }], false);
    // 63939 taxable, 5755 + 5755 tax = 75449 → 75400, round-off −49
    expect(t.taxablePaise).toBe(63939);
    expect(t.cgstPaise).toBe(5755);
    expect(t.totalPaise).toBe(75400);
    expect(t.roundOffPaise).toBe(-49);
  });

  it("taxes transport/loading charges", () => {
    const t = computeDocTotals([{ qtyPcs: 1, ratePaise: 100000, gstRate: 18 }], false, 50000);
    expect(t.cgstPaise).toBe(9000 + 4500);
    expect(t.totalPaise).toBe(177000);
  });
});

describe("money", () => {
  it("formats Indian grouping", () => {
    expect(formatIndian(1234567.5)).toBe("12,34,567.50");
    expect(formatIndian(999)).toBe("999.00");
    expect(formatINR(123456789)).toBe("₹12,34,567.89");
    expect(formatINR(-5000)).toBe("₹-50.00");
  });

  it("parses rupees to paise without float error", () => {
    expect(rupeesToPaise("1,23,456.78")).toBe(12345678);
    expect(rupeesToPaise("0.1")).toBe(10);
    expect(rupeesToPaise("19.995")).toBe(2000);
    expect(rupeesToPaise("")).toBe(0);
    expect(() => rupeesToPaise("abc")).toThrow();
  });

  it("rounds to rupee", () => {
    expect(roundToRupee(10050)).toEqual({ total: 10100, roundOff: 50 });
    expect(roundToRupee(10049)).toEqual({ total: 10000, roundOff: -49 });
  });

  it("writes amounts in Indian words", () => {
    expect(amountInWords(1234567800)).toBe("Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Only");
    expect(amountInWords(150050)).toBe("Rupees One Thousand Five Hundred and Fifty Paise Only");
  });
});

describe("financial year and numbering", () => {
  it("uses April–March in IST", () => {
    expect(financialYear(new Date("2026-10-24T10:00:00Z"))).toBe("26-27");
    expect(financialYear(new Date("2027-02-10T10:00:00Z"))).toBe("26-27");
    // 31 Mar 2027 20:00 UTC is already 1 Apr 2027 in IST
    expect(financialYear(new Date("2027-03-31T20:00:00Z"))).toBe("27-28");
  });

  it("formats document numbers", () => {
    expect(formatDocNo("KC", "CBE", "26-27", 1)).toBe("KC/CBE/26-27/0001");
  });

  it("formats dates in IST and ageing buckets", () => {
    expect(formatDate("2026-10-23T20:00:00Z")).toBe("24 Oct 2026");
    expect(ageingBucket(0)).toBe("0-30");
    expect(ageingBucket(45)).toBe("31-60");
    expect(ageingBucket(91)).toBe("90+");
  });
});

describe("GSTIN", () => {
  it("validates format and checksum", () => {
    const base = "33AABCG1234F1Z";
    const good = base + gstinChecksum(base);
    expect(validateGstin(good).valid).toBe(true);
    const badDigit = good.slice(0, 14) + (good[14] === "A" ? "B" : "A");
    expect(validateGstin(badDigit).valid).toBe(false);
    expect(validateGstin("33AABCG1234F1Z").error).toMatch(/15 characters/);
    expect(validateGstin("ABCDEFGHIJKLMNO").valid).toBe(false);
  });
});
