import { describe, expect, it } from "vitest";
import {
  boxesForArea,
  floorArea,
  formatQty,
  piecesForArea,
  piecesToSqft,
  ratePerBoxToPerPiece,
  ratePerSqftToPerPiece,
  roundUpToBox,
  splitBoxes,
  sqmToSqft,
  toPerPieceRate,
  wallArea,
} from "./units";

const tile600x600 = { uomType: "PIECE_BOX_AREA", pcsPerBox: 4, sqftPerBox: 15.5 };
const tile600x1200 = { uomType: "PIECE_BOX_AREA", pcsPerBox: 2, sqftPerBox: 15.5 };

describe("unit conversion", () => {
  it("splits pieces into boxes and loose pieces", () => {
    expect(splitBoxes(51, 4)).toEqual({ boxes: 12, loose: 3 });
    expect(splitBoxes(48, 4)).toEqual({ boxes: 12, loose: 0 });
    expect(splitBoxes(-5, 4)).toEqual({ boxes: -1, loose: -1 });
  });

  it("formats '12 box + 3 pcs (sq ft)' and unit items", () => {
    expect(formatQty(51, tile600x600)).toBe("12 box + 3 pcs (197.6 sq ft)");
    expect(formatQty(40, { uomType: "PIECE_BOX_AREA", pcsPerBox: 4, sqftPerBox: 15.5 })).toBe("10 box (155.0 sq ft)");
    expect(formatQty(3, { uomType: "UNIT", pcsPerBox: null, sqftPerBox: null, unitName: "nos" })).toBe("3 nos");
  });

  it("converts pieces to sq ft", () => {
    expect(piecesToSqft(4, tile600x600)).toBeCloseTo(15.5);
    expect(piecesToSqft(1, tile600x1200)).toBeCloseTo(7.75);
  });

  it("boxes = ceil(required × (1 + wastage) / sqft per box)", () => {
    // 150 sq ft + 5% = 157.5 → 157.5 / 15.5 = 10.16 → 11 boxes
    expect(boxesForArea(150, 5, 15.5)).toBe(11);
    // exactly 155 sq ft with 0% wastage → 10 boxes, not 11 from float noise
    expect(boxesForArea(155, 0, 15.5)).toBe(10);
    expect(boxesForArea(0, 5, 15.5)).toBe(0);
  });

  it("rounds to full boxes unless loose sale is allowed", () => {
    expect(piecesForArea(150, 5, { ...tile600x600, allowLooseSale: false })).toBe(44);
    // loose: 157.5 sq ft × 4 / 15.5 = 40.6 → 41 pieces
    expect(piecesForArea(150, 5, { ...tile600x600, allowLooseSale: true })).toBe(41);
    expect(roundUpToBox(41, 4)).toBe(44);
  });

  it("converts entered rates to per-piece paise", () => {
    // ₹55/sq ft on 15.5 sq ft per box of 4 → ₹213.125 per piece → 21313 paise
    expect(ratePerSqftToPerPiece(5500, tile600x600)).toBe(21313);
    expect(ratePerBoxToPerPiece(248000, 2)).toBe(124000);
    expect(toPerPieceRate(185000, "PER_UNIT", { pcsPerBox: null, sqftPerBox: null })).toBe(185000);
  });

  it("room areas", () => {
    expect(floorArea(12, 10)).toBe(120);
    // 2 × (12 + 10) × 10 − 21 (door) = 419
    expect(wallArea(12, 10, 10, 21)).toBe(419);
    expect(sqmToSqft(1)).toBeCloseTo(10.7639);
  });
});
