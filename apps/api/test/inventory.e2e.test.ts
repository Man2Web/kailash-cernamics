import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, loginAs, TestCtx } from "./helpers";
import { inventoryFixtures } from "./inventory-fixtures";

describe("inventory: ledger, transfers, adjustments, breakage, reports", () => {
  let t: TestCtx;
  let f: Awaited<ReturnType<typeof inventoryFixtures>>;
  let owner: Awaited<ReturnType<typeof loginAs>>;
  let batchS1: string;
  let batchS2: string;

  beforeAll(async () => {
    t = await createTestApp();
    f = await inventoryFixtures(t.prisma);
    owner = await loginAs(t.app);
    const g = await owner.post("/api/grns", {
      supplierId: f.supplier.id,
      godownId: t.base.mainGodown.id,
      freightPaise: 0,
      lines: [
        { productId: f.tile.id, batchNo: "B-S1", shadeCode: "S1", caliber: "C1", grade: "STANDARD", qtyPcs: 200, ratePaise: 9000 },
        { productId: f.tile.id, batchNo: "B-S2", shadeCode: "S2", caliber: "C1", grade: "STANDARD", qtyPcs: 96, ratePaise: 9000 },
        { productId: f.wc.id, qtyPcs: 5, ratePaise: 1200000 },
      ],
    });
    const p = await owner.post(`/api/grns/${g.body.id}/post`);
    if (p.status !== 201) throw new Error(JSON.stringify(p.body));
    batchS1 = (await t.prisma.batch.findFirstOrThrow({ where: { batchNo: "B-S1" } })).id;
    batchS2 = (await t.prisma.batch.findFirstOrThrow({ where: { batchNo: "B-S2" } })).id;
  });
  afterAll(async () => {
    await t.app.close();
  });

  it("stock summary shows box + pcs + sq ft and flags below reorder level", async () => {
    const res = await owner.get("/api/stock/summary?q=wood");
    expect(res.status).toBe(200);
    const row = res.body.items[0];
    expect(row.saleable).toBe(296);
    expect(row.available).toBe(296);
    expect(row.availableText).toBe("37 box (573.5 sq ft)");
    expect(row.belowReorder).toBe(true);
    const low = await owner.get("/api/stock/low");
    expect(low.body.items.map((r: any) => r.sku)).toContain("TL-KJ-3060-WD");
  });

  it("availability lists batches by shade for the sales screen", async () => {
    const res = await owner.get(`/api/stock/availability?productId=${f.tile.id}`);
    expect(res.status).toBe(200);
    expect(res.body.map((r: any) => [r.batch.shadeCode, r.available])).toEqual([
      ["S1", 200],
      ["S2", 96],
    ]);
  });

  it("transfer moves stock to the showroom as DISPLAY and the ledger records both sides", async () => {
    const res = await owner.post("/api/stock/transfers", {
      fromGodownId: t.base.mainGodown.id,
      toGodownId: t.base.showroom.id,
      lines: [{ productId: f.tile.id, batchId: batchS1, qtyPcs: 8, fromStockType: "SALEABLE", toStockType: "DISPLAY" }],
    });
    expect(res.status).toBe(201);
    expect(res.body.number).toMatch(/^ST\/CBE\//);
    const d = await owner.get(`/api/stock/products/${f.tile.id}`);
    expect(d.body.totals.saleable).toBe(288);
    expect(d.body.totals.display).toBe(8);
    const ledger = await owner.get(`/api/stock/ledger?refType=TRANSFER`);
    expect(ledger.body.total).toBe(2);
  });

  it("rejects moves that would make stock negative", async () => {
    const res = await owner.post("/api/stock/transfers", {
      fromGodownId: t.base.mainGodown.id,
      toGodownId: t.base.showroom.id,
      lines: [{ productId: f.tile.id, batchId: batchS2, qtyPcs: 97 }],
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Not enough saleable stock/);
    const d = await owner.get(`/api/stock/products/${f.tile.id}`);
    expect(d.body.totals.saleable).toBe(288);
  });

  it("adjustment needs approval and posts on approve", async () => {
    const adj = await owner.post("/api/stock/adjustments", {
      godownId: t.base.mainGodown.id,
      reason: "Physical count difference",
      lines: [{ productId: f.tile.id, batchId: batchS2, qtyPcs: -6 }],
    });
    expect(adj.status).toBe(201);
    expect(adj.body.status).toBe("DRAFT");
    const sub = await owner.post(`/api/stock/adjustments/${adj.body.id}/submit`);
    expect(sub.body.status).toBe("PENDING_APPROVAL");
    // nothing posted yet
    expect((await owner.get(`/api/stock/products/${f.tile.id}`)).body.totals.saleable).toBe(288);
    const sales = await loginAs(t.app, "sales@kailashceramics.com");
    const denied = await sales.post(`/api/approvals/${sub.body.approvalId}/decide`, { approve: true });
    expect(denied.status).toBe(403);
    const ok = await owner.post(`/api/approvals/${sub.body.approvalId}/decide`, { approve: true });
    expect(ok.status).toBe(201);
    const after = await owner.get(`/api/stock/adjustments/${adj.body.id}`);
    expect(after.body.status).toBe("POSTED");
    expect((await owner.get(`/api/stock/products/${f.tile.id}`)).body.totals.saleable).toBe(282);
  });

  it("breakage moves SALEABLE to DAMAGED; write-off removes it after approval", async () => {
    const b = await owner.post("/api/stock/breakage", {
      stage: "GODOWN",
      productId: f.tile.id,
      batchId: batchS1,
      godownId: t.base.mainGodown.id,
      qtyPcs: 3,
      reason: "Forklift damage",
      photos: ["/api/files/breakage/x.jpg"],
    });
    expect(b.status).toBe(201);
    let d = await owner.get(`/api/stock/products/${f.tile.id}`);
    expect(d.body.totals.saleable).toBe(279);
    expect(d.body.totals.damaged).toBe(3);
    const w = await owner.post(`/api/stock/breakage/${b.body.id}/write-off`, { reason: "Not sellable" });
    expect(w.body.status).toBe("PENDING_APPROVAL");
    const approval = await t.prisma.approvalRequest.findFirstOrThrow({ where: { refType: "breakage_entry", refId: b.body.id } });
    await owner.post(`/api/approvals/${approval.id}/decide`, { approve: true });
    d = await owner.get(`/api/stock/products/${f.tile.id}`);
    expect(d.body.totals.damaged).toBe(0);
  });

  it("stock value needs cost.read; sales users don't see landed cost", async () => {
    const v = await owner.get("/api/stock/value");
    expect(v.status).toBe(200);
    expect(v.body.totalValuePaise).toBeGreaterThan(0);
    const sales = await loginAs(t.app, "sales@kailashceramics.com");
    expect((await sales.get("/api/stock/value")).status).toBe(403);
    const avail = await sales.get(`/api/stock/availability?productId=${f.tile.id}`);
    expect(avail.body[0].batch.landedCostPaise).toBeUndefined();
  });

  it("dead stock and ageing reports respond", async () => {
    const dead = await owner.get("/api/stock/dead?days=1");
    expect(dead.status).toBe(200);
    const ageing = await owner.get("/api/stock/ageing");
    expect(ageing.status).toBe(200);
    expect(ageing.body.buckets["0-30"].qtyPcs).toBeGreaterThan(0);
  });
});
