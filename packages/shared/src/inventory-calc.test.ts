import { describe, expect, it } from "vitest";
import { formatArea, isOddLeftover, loadStatus, rankLotsForRequirement, reorderSuggestion, weightKg } from "./inventory-calc";

describe("single-lot fulfilment", () => {
  const lots = [
    { batchId: "A", available: 200, ageDays: 10 },
    { batchId: "B", available: 48, ageDays: 12 },
    { batchId: "C", available: 30, ageDays: 5 },
    { batchId: "D", available: 0, ageDays: 90 },
  ];

  it("puts lots that cover the whole need first, smallest leftover when ages are close", () => {
    const r = rankLotsForRequirement(lots, 44);
    expect(r.map((o) => o.lot.batchId)).toEqual(["B", "A", "C"]);
    expect(r[0]).toMatchObject({ fits: true, leftoverPcs: 4 });
    expect(r[2]).toMatchObject({ fits: false, shortPcs: 14 });
  });

  it("avoids leaving an odd lot: exact clear first, then a sellable remainder", () => {
    // 41 boxes of 4 needed = 164 pcs; lot A leaves 1 box (odd), lot B leaves 2 boxes, lot C clears exactly
    const r = rankLotsForRequirement(
      [{ batchId: "A", available: 168 }, { batchId: "B", available: 172 }, { batchId: "C", available: 164 }],
      164,
      4,
    );
    expect(r.map((o) => o.lot.batchId)).toEqual(["C", "B", "A"]);
  });

  it("prefers a much older lot (FIFO) when it also fits", () => {
    const r = rankLotsForRequirement([{ batchId: "new", available: 50, ageDays: 2 }, { batchId: "old", available: 400, ageDays: 120 }], 40);
    expect(r[0].lot.batchId).toBe("old");
  });

  it("flags odd leftovers below two boxes", () => {
    expect(isOddLeftover(4, 4)).toBe(true);
    expect(isOddLeftover(8, 4)).toBe(false);
    expect(isOddLeftover(0, 4)).toBe(false);
  });
});

describe("reorder suggestion", () => {
  it("suggests cover for lead time + safety + one cycle, in full boxes", () => {
    // 2 pcs/day, lead 15, safety 7 → target 2 × (30 + 7) = 74; position 20 → need 54 → 56 (box of 4)
    const r = reorderSuggestion({ soldPcs: 180, windowDays: 90, availablePcs: 20, onOrderPcs: 0, leadTimeDays: 15, safetyStockDays: 7, pcsPerBox: 4 });
    expect(r.dailyPcs).toBe(2);
    expect(r.reason).toBe("COVER_BELOW_LEAD_TIME");
    expect(r.suggestedPcs).toBe(56);
  });

  it("counts open POs and stays quiet when covered", () => {
    const r = reorderSuggestion({ soldPcs: 180, windowDays: 90, availablePcs: 20, onOrderPcs: 100, leadTimeDays: 15, safetyStockDays: 7, pcsPerBox: 4 });
    expect(r.reason).toBe("OK");
    expect(r.suggestedPcs).toBe(0);
  });

  it("respects the reorder level for slow items", () => {
    const r = reorderSuggestion({ soldPcs: 0, windowDays: 90, availablePcs: 4, onOrderPcs: 0, leadTimeDays: 15, safetyStockDays: 7, reorderLevelPcs: 20, pcsPerBox: 8 });
    expect(r.reason).toBe("BELOW_REORDER_LEVEL");
    expect(r.suggestedPcs).toBe(16);
  });
});

describe("weight, area and load", () => {
  it("weighs tiles by box and sanitary by unit", () => {
    expect(weightKg(10, { uomType: "PIECE_BOX_AREA", pcsPerBox: 4, weightPerBoxKg: 30 })).toBe(75);
    expect(weightKg(3, { uomType: "UNIT", weightPerBoxKg: 28 })).toBe(84);
    expect(weightKg(3, { uomType: "UNIT" })).toBe(0);
  });

  it("shows sq ft and sq m", () => {
    expect(formatArea(40, { pcsPerBox: 4, sqftPerBox: 15.5 })).toBe("155.0 sq ft · 14.40 sq m");
  });

  it("checks truck capacity", () => {
    expect(loadStatus(4500, 4000)).toEqual({ pct: 113, over: true });
    expect(loadStatus(100, null)).toEqual({ pct: null, over: false });
  });
});
