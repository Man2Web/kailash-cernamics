import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, loginAs, TestCtx } from "./helpers";
import { inventoryFixtures } from "./inventory-fixtures";

describe("sanitary variants, samples, display boards, breakage claims", () => {
  let t: TestCtx;
  let fx: Awaited<ReturnType<typeof inventoryFixtures>>;
  let owner: Awaited<ReturnType<typeof loginAs>>;
  let tileBatchId: string;

  const bal = async (batchId: string, godownId: string, stockType: string) =>
    (await t.prisma.stockBalance.aggregate({ where: { batchId, godownId, stockType: stockType as never }, _sum: { qtyPcs: true } }))._sum.qtyPcs ?? 0;

  beforeAll(async () => {
    t = await createTestApp();
    fx = await inventoryFixtures(t.prisma);
    owner = await loginAs(t.app);
    // tile stock with landed cost and 6 pcs broken on receipt
    const grn = await owner.post("/api/grns", {
      supplierId: fx.supplier.id,
      godownId: t.base.mainGodown.id,
      freightPaise: 0,
      lines: [{ productId: fx.tile.id, batchNo: "KJ-1", shadeCode: "S1", caliber: "C1", qtyPcs: 400, damagedPcs: 6, ratePaise: 10000 }],
    });
    expect(grn.status).toBe(201);
    expect((await owner.post(`/api/grns/${grn.body.id}/post`)).status).toBe(201);
    tileBatchId = (await t.prisma.batch.findFirstOrThrow({ where: { productId: fx.tile.id, batchNo: "KJ-1" } })).id;
  });

  afterAll(async () => {
    await t.app.close();
  });

  it("GRN with two colour variants creates two lots, stock per colour", async () => {
    const white = await t.prisma.color.create({ data: { name: "White" } });
    const ivory = await t.prisma.color.create({ data: { name: "Ivory" } });
    const vW = await t.prisma.productVariant.create({ data: { productId: fx.wc.id, colorId: white.id, skuSuffix: "WH" } });
    const vI = await t.prisma.productVariant.create({ data: { productId: fx.wc.id, colorId: ivory.id, skuSuffix: "IV" } });
    const grn = await owner.post("/api/grns", {
      supplierId: fx.supplier.id,
      godownId: t.base.mainGodown.id,
      lines: [
        { productId: fx.wc.id, variantId: vW.id, qtyPcs: 5, ratePaise: 1200000 },
        { productId: fx.wc.id, variantId: vI.id, qtyPcs: 3, ratePaise: 1250000 },
      ],
    });
    expect(grn.status).toBe(201);
    expect((await owner.post(`/api/grns/${grn.body.id}/post`)).status).toBe(201);
    const lots = await t.prisma.batch.findMany({ where: { productId: fx.wc.id }, orderBy: { batchNo: "asc" } });
    expect(lots.map((l) => [l.batchNo, l.shadeCode, l.variantId])).toEqual([
      ["V-IV", "Ivory", vI.id],
      ["V-WH", "White", vW.id],
    ]);
    const res = await owner.get(`/api/stock/variants?productId=${fx.wc.id}`);
    expect(res.status).toBe(200);
    const byColor = Object.fromEntries(res.body.lots.map((l: any) => [l.variant?.color, l.available]));
    expect(byColor).toMatchObject({ White: 5, Ivory: 3 });
  });

  it("issues samples, takes some back (one damaged), writes off the rest", async () => {
    const g = t.base.mainGodown.id;
    const before = await bal(tileBatchId, g, "SALEABLE");
    const issue = await owner.post("/api/samples", {
      godownId: g,
      issuedToName: "Ar. Priya",
      phone: "9840011122",
      expectedReturnDate: "2026-01-01",
      lines: [{ productId: fx.tile.id, batchId: tileBatchId, qtyPcs: 4 }],
    });
    expect(issue.status).toBe(201);
    expect(issue.body.status).toBe("OPEN");
    expect(issue.body.number).toMatch(/^SM\/CBE\//);
    expect(await bal(tileBatchId, g, "SALEABLE")).toBe(before - 4);
    expect(await bal(tileBatchId, g, "SAMPLE")).toBe(4);

    const overdue = await owner.get("/api/samples?overdue=true");
    expect(overdue.body.items.map((i: any) => i.id)).toContain(issue.body.id);

    const lineId = issue.body.lines[0].id;
    const ret = await owner.post(`/api/samples/${issue.body.id}/return`, { lines: [{ lineId, returnedPcs: 2, damagedPcs: 1 }] });
    expect(ret.status).toBe(201);
    expect(ret.body.status).toBe("PARTIAL");
    expect(await bal(tileBatchId, g, "SALEABLE")).toBe(before - 2);
    expect(await bal(tileBatchId, g, "SAMPLE")).toBe(1);

    const tooMany = await owner.post(`/api/samples/${issue.body.id}/close`, { lines: [{ lineId, closedPcs: 2 }], reason: "Kept" });
    expect(tooMany.status).toBe(400);
    const close = await owner.post(`/api/samples/${issue.body.id}/close`, { lines: [{ lineId, closedPcs: 1 }], reason: "Kept by architect" });
    expect(close.status).toBe(201);
    expect(close.body.status).toBe("CLOSED");
    expect(await bal(tileBatchId, g, "SAMPLE")).toBe(0);
  });

  it("display boards take tiles from the godown and give them back", async () => {
    const notShowroom = await owner.post("/api/display-boards", { godownId: t.base.mainGodown.id, code: "B1", name: "Bay 1" });
    expect(notShowroom.status).toBe(400);
    const board = await owner.post("/api/display-boards", { godownId: t.base.showroom.id, code: "B1", name: "Bay 1", location: "Entrance wall" });
    expect(board.status).toBe(201);
    const main = t.base.mainGodown.id;
    const before = await bal(tileBatchId, main, "SALEABLE");
    const add = await owner.post(`/api/display-boards/${board.body.id}/items`, { productId: fx.tile.id, batchId: tileBatchId, fromGodownId: main, qtyPcs: 8 });
    expect(add.status).toBe(201);
    expect(add.body.items).toHaveLength(1);
    expect(await bal(tileBatchId, main, "SALEABLE")).toBe(before - 8);
    expect(await bal(tileBatchId, t.base.showroom.id, "DISPLAY")).toBe(8);
    expect((await owner.del(`/api/display-boards/${board.body.id}`)).status).toBe(400);

    const rm = await owner.post(`/api/display-boards/${board.body.id}/items/${add.body.items[0].id}/remove`, { toGodownId: main, toStockType: "DAMAGED" });
    expect(rm.status).toBe(201);
    expect(rm.body.items).toHaveLength(0);
    expect(await bal(tileBatchId, t.base.showroom.id, "DISPLAY")).toBe(0);
    expect(await bal(tileBatchId, main, "DAMAGED")).toBe(6 + 1 + 8); // GRN breakage + damaged sample return + board tiles
  });

  it("claims receipt breakage from the supplier at landed cost and settles it", async () => {
    const cand = await owner.get(`/api/breakage-claims/candidates?supplierId=${fx.supplier.id}`);
    expect(cand.status).toBe(200);
    expect(cand.body).toHaveLength(1);
    expect(cand.body[0]).toMatchObject({ qtyPcs: 6, stage: "RECEIPT", valuePaise: 60000 });
    const other = await owner.post("/api/breakage-claims", { supplierId: fx.outsider.id, entryIds: [cand.body[0].id] });
    expect(other.status).toBe(400);
    const claim = await owner.post("/api/breakage-claims", { supplierId: fx.supplier.id, entryIds: [cand.body[0].id], notes: "Unloading breakage" });
    expect(claim.status).toBe(201);
    expect(claim.body.claimedPaise).toBe(60000);
    expect(claim.body.number).toMatch(/^BC\/CBE\//);
    expect((await owner.get(`/api/breakage-claims/candidates?supplierId=${fx.supplier.id}`)).body).toHaveLength(0);
    expect((await owner.post(`/api/breakage-claims/${claim.body.id}/submit`)).status).toBe(201);
    const over = await owner.post(`/api/breakage-claims/${claim.body.id}/settle`, { settlementType: "CREDIT_NOTE", settledPaise: 99999 });
    expect(over.status).toBe(400);
    const settle = await owner.post(`/api/breakage-claims/${claim.body.id}/settle`, { settlementType: "CREDIT_NOTE", settledPaise: 55000, settlementRef: "KJ-CN-77" });
    expect(settle.status).toBe(201);
    expect(settle.body.status).toBe("SETTLED");
    const audit = await t.prisma.auditLog.count({ where: { entity: "breakage_claim", entityId: claim.body.id } });
    expect(audit).toBe(3);
  });

  it("breakage rate by supplier, and permissions", async () => {
    const rate = await owner.get("/api/stock/breakage-rate?groupBy=supplier");
    expect(rate.status).toBe(200);
    const row = rate.body.find((r: any) => r.id === fx.supplier.id);
    expect(row).toMatchObject({ receivedPcs: 408, receiptPcs: 6 });
    expect(row.ratePct).toBeCloseTo(1.47, 2);
    const accounts = await loginAs(t.app, "accounts@kailashceramics.com");
    expect((await accounts.post("/api/samples", { godownId: t.base.mainGodown.id, issuedToName: "X", lines: [{ productId: fx.tile.id, batchId: tileBatchId, qtyPcs: 1 }] })).status).toBe(403);
    const sales = await loginAs(t.app, "sales@kailashceramics.com");
    expect((await sales.get("/api/samples")).status).toBe(200);
    expect((await sales.post("/api/breakage-claims", { supplierId: fx.supplier.id, entryIds: ["x"] })).status).toBe(403);
  });
});
