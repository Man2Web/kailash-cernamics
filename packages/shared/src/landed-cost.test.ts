import { describe, expect, it } from "vitest";
import { allocateLandedCost, schemeSlabFor } from "./schemas/purchase";

describe("allocateLandedCost", () => {
  it("allocates by value and totals match exactly", () => {
    const r = allocateLandedCost(
      [
        { qtyPcs: 100, ratePaise: 10000 }, // 10,00,000
        { qtyPcs: 50, ratePaise: 10000 }, // 5,00,000
      ],
      30000,
      "VALUE",
    );
    expect(r[0].allocatedPaise).toBe(20000);
    expect(r[1].allocatedPaise).toBe(10000);
    expect(r[0].landedRatePaise).toBe(10200);
    expect(r[1].landedRatePaise).toBe(10200);
  });

  it("puts the rounding remainder on the last line", () => {
    const r = allocateLandedCost(
      [
        { qtyPcs: 1, ratePaise: 100 },
        { qtyPcs: 1, ratePaise: 100 },
        { qtyPcs: 1, ratePaise: 100 },
      ],
      100,
      "VALUE",
    );
    expect(r.map((x) => x.allocatedPaise)).toEqual([33, 33, 34]);
    expect(r.reduce((a, x) => a + x.allocatedPaise, 0)).toBe(100);
  });

  it("allocates by weight and falls back to value without weights", () => {
    const w = allocateLandedCost(
      [
        { qtyPcs: 10, ratePaise: 1000, weightKg: 300 },
        { qtyPcs: 10, ratePaise: 9000, weightKg: 100 },
      ],
      4000,
      "WEIGHT",
    );
    expect(w.map((x) => x.allocatedPaise)).toEqual([3000, 1000]);
    const fallback = allocateLandedCost([{ qtyPcs: 10, ratePaise: 1000 }, { qtyPcs: 10, ratePaise: 3000 }], 4000, "WEIGHT");
    expect(fallback.map((x) => x.allocatedPaise)).toEqual([1000, 3000]);
  });

  it("handles zero charges and zero-value lines", () => {
    expect(allocateLandedCost([{ qtyPcs: 5, ratePaise: 100 }], 0, "VALUE")[0]).toEqual({ allocatedPaise: 0, landedRatePaise: 100 });
    const free = allocateLandedCost([{ qtyPcs: 4, ratePaise: 0 }, { qtyPcs: 6, ratePaise: 0 }], 1000, "VALUE");
    expect(free.map((x) => x.allocatedPaise)).toEqual([400, 600]);
  });
});

describe("schemeSlabFor", () => {
  const slabs = [
    { threshold: 100, rebatePct: 1 },
    { threshold: 500, rebatePct: 2 },
    { threshold: 1000, rebatePct: 3 },
  ];
  it("finds current and next slab", () => {
    expect(schemeSlabFor(50, slabs)).toEqual({ current: null, next: slabs[0] });
    expect(schemeSlabFor(600, slabs)).toEqual({ current: slabs[1], next: slabs[2] });
    expect(schemeSlabFor(5000, slabs)).toEqual({ current: slabs[2], next: null });
  });
});
