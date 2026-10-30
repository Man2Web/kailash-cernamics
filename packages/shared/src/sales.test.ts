import { describe, expect, it } from "vitest";
import { salesAreaQty, salesAreaSqft, salesDocTotals, salesLineAmounts, salesWhatsAppLink } from "./schemas/sales";

const tile600x1200 = { uomType: "PIECE_BOX_AREA", pcsPerBox: 2, sqftPerBox: 15.5, allowLooseSale: false, gstRate: 18 };
const woodStrip = { uomType: "PIECE_BOX_AREA", pcsPerBox: 8, sqftPerBox: 15.5, allowLooseSale: true, gstRate: 18 };
const wc = { uomType: "UNIT", gstRate: 18 };

describe("room areas", () => {
  it("floor = L × W", () => {
    expect(salesAreaSqft({ lengthFt: 12, widthFt: 10 }, "FLOOR")).toBe(120);
  });
  it("wall = 2(L+W)H − deductions", () => {
    expect(salesAreaSqft({ lengthFt: 8, widthFt: 6, heightFt: 7, deductionsSqft: 21 }, "WALL")).toBe(2 * 14 * 7 - 21);
  });
  it("highlighter uses the entered area", () => {
    expect(salesAreaSqft({ lengthFt: 8, widthFt: 6 }, "HIGHLIGHTER", 24)).toBe(24);
  });
});

describe("boxes for an area", () => {
  it("rounds up to full boxes: 120 sq ft + 5% / 15.5 = 8.13 → 9 boxes", () => {
    expect(salesAreaQty(tile600x1200, 120, 5)).toEqual({ qtyPcs: 18, boxes: 9, loosePcs: 0 });
  });
  it("loose sale allowed: rounds to whole pieces", () => {
    // 100 × 1.05 = 105 sq ft → 105 × 8 / 15.5 = 54.19 → 55 pcs = 6 box + 7 pcs
    expect(salesAreaQty(woodStrip, 100, 5)).toEqual({ qtyPcs: 55, boxes: 6, loosePcs: 7 });
  });
  it("exact multiple does not add a box", () => {
    expect(salesAreaQty(tile600x1200, 155, 0)).toEqual({ qtyPcs: 20, boxes: 10, loosePcs: 0 });
  });
});

describe("line amounts and GST", () => {
  it("per sq ft price → per piece rate", () => {
    // ₹80/sq ft × 15.5 / 2 = ₹620 per piece
    const l = salesLineAmounts(tile600x1200, { qtyPcs: 18, priceBasis: "PER_SQFT", enteredRatePaise: 8000 }, false);
    expect(l.ratePaise).toBe(62000);
    expect(l.taxablePaise).toBe(18 * 62000);
    expect(l.cgstPaise).toBe(Math.round((18 * 62000 * 18) / 200));
    expect(l.cgstPaise).toBe(l.sgstPaise);
    expect(l.igstPaise).toBe(0);
  });
  it("inter-state uses IGST", () => {
    const l = salesLineAmounts(wc, { qtyPcs: 2, priceBasis: "PER_UNIT", enteredRatePaise: 1850000, discountPct: 10 }, true);
    expect(l.taxablePaise).toBe(3330000);
    expect(l.igstPaise).toBe(599400);
    expect(l.cgstPaise).toBe(0);
  });
  it("doc totals round to the rupee and tax charges", () => {
    const t = salesDocTotals([{ product: tile600x1200, line: { qtyPcs: 3, priceBasis: "PER_BOX", enteredRatePaise: 124055 } }], false, 50000, 18);
    expect(t.totalPaise % 100).toBe(0);
    expect(t.chargesTaxPaise).toBe(9000);
  });
});

describe("whatsapp link", () => {
  it("prefixes India code for 10-digit numbers", () => {
    expect(salesWhatsAppLink("98430 12345", "hi")).toBe("https://wa.me/919843012345?text=hi");
  });
});
