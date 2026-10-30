import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, loginAs, TestCtx } from "./helpers";
import { inventoryFixtures } from "./inventory-fixtures";

describe("purchase: PO → GRN with landed cost → purchase invoice → debit note, schemes", () => {
  let t: TestCtx;
  let f: Awaited<ReturnType<typeof inventoryFixtures>>;
  let owner: Awaited<ReturnType<typeof loginAs>>;
  let rackA1: string;

  beforeAll(async () => {
    t = await createTestApp();
    f = await inventoryFixtures(t.prisma);
    owner = await loginAs(t.app);
    rackA1 = (await t.prisma.rack.findFirstOrThrow({ where: { godownId: t.base.mainGodown.id, code: "A1" } })).id;
  });
  afterAll(async () => {
    await t.app.close();
  });

  let poId: string;
  let poLineId: string;

  it("creates and approves a purchase order", async () => {
    const res = await owner.post("/api/purchase-orders", { supplierId: f.supplier.id, brandId: f.brand.id, lines: [{ productId: f.tile.id, qtyPcs: 800, ratePaise: 10000, gstRate: 18 }] });
    expect(res.status).toBe(201);
    expect(res.body.number).toMatch(/^PO\/CBE\/\d\d-\d\d\/0001$/);
    // 800 × ₹100 = ₹80,000 + 18% = ₹94,400
    expect(res.body.totalPaise).toBe(9_440_000);
    poId = res.body.id;
    poLineId = res.body.lines[0].id;
    expect((await owner.post(`/api/purchase-orders/${poId}/approve`)).body.status).toBe("APPROVED");
  });

  it("refuses to post a tile GRN line without shade/caliber", async () => {
    const g = await owner.post("/api/grns", { supplierId: f.supplier.id, godownId: t.base.mainGodown.id, lines: [{ productId: f.tile.id, qtyPcs: 8, ratePaise: 10000 }] });
    expect(g.status).toBe(201);
    const p = await owner.post(`/api/grns/${g.body.id}/post`);
    expect(p.status).toBe(400);
    expect(p.body.message).toMatch(/shade and caliber are required/);
  });

  let grnId: string;
  it("posts a GRN with freight: batches carry landed cost, stock by shade lands in the rack", async () => {
    const g = await owner.post("/api/grns", {
      supplierId: f.supplier.id,
      poId,
      godownId: t.base.mainGodown.id,
      truckNo: "TN 38 AB 1234",
      freightPaise: 300000, // ₹3,000
      unloadingPaise: 100000, // ₹1,000
      allocationBasis: "VALUE",
      lines: [
        { poLineId, productId: f.tile.id, batchNo: "KJ-2610-A", shadeCode: "S1", caliber: "C2", grade: "PREMIUM", rackId: rackA1, qtyPcs: 240, damagedPcs: 8, ratePaise: 10000 },
        { poLineId, productId: f.tile.id, batchNo: "KJ-2610-B", shadeCode: "S2", caliber: "C2", grade: "PREMIUM", rackId: rackA1, qtyPcs: 160, ratePaise: 10000 },
      ],
    });
    expect(g.status).toBe(201);
    grnId = g.body.id;
    const posted = await owner.post(`/api/grns/${grnId}/post`);
    expect(posted.status).toBe(201);
    expect(posted.body.status).toBe("POSTED");

    // ₹4,000 over ₹40,000 of goods (240:160) → ₹2,400 and ₹1,600 → +₹10 per piece
    const batches = await t.prisma.batch.findMany({ where: { productId: f.tile.id }, orderBy: { batchNo: "asc" } });
    expect(batches.map((b) => [b.shadeCode, Number(b.landedCostPaise)])).toEqual([
      ["S1", 11000],
      ["S2", 11000],
    ]);

    const detail = await owner.get(`/api/stock/products/${f.tile.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.totals.saleable).toBe(232 + 160);
    expect(detail.body.totals.damaged).toBe(8);
    const s1 = detail.body.batches.find((b: any) => b.batch.shadeCode === "S1");
    expect(s1.totals.saleable).toBe(232);
    expect(s1.locations.find((l: any) => l.stockType === "SALEABLE").rack.code).toBe("A1");
    expect(detail.body.totals.availableText).toBe("49 box (759.5 sq ft)");

    const breakage = await t.prisma.breakageEntry.findFirst({ where: { refType: "GRN", refId: grnId } });
    expect(breakage?.stage).toBe("RECEIPT");
    const po = await owner.get(`/api/purchase-orders/${poId}`);
    expect(po.body.status).toBe("PARTIAL");
    expect(po.body.lines[0].receivedPcs).toBe(400);
  });

  it("purchase invoice: variance warnings, IGST for inter-state, post enqueues Tally", async () => {
    const inv = await owner.post("/api/purchase-invoices", {
      supplierId: f.supplier.id,
      supplierInvoiceNo: "KJ/26/9911",
      poId,
      grnId,
      lines: [{ productId: f.tile.id, qtyPcs: 400, ratePaise: 10500, gstRate: 18 }],
    });
    expect(inv.status).toBe(201);
    expect(inv.body.warnings.join(" ")).toMatch(/differs from PO rate/);
    expect(inv.body.cgstPaise).toBe(378000);
    expect(inv.body.igstPaise).toBe(0);
    const dup = await owner.post("/api/purchase-invoices", { supplierId: f.supplier.id, supplierInvoiceNo: "KJ/26/9911", lines: [{ productId: f.tile.id, qtyPcs: 1, ratePaise: 1, gstRate: 18 }] });
    expect(dup.status).toBe(400);
    const posted = await owner.post(`/api/purchase-invoices/${inv.body.id}/post`);
    expect(posted.body.status).toBe("POSTED");
    const queue = await t.prisma.tallySyncQueue.findMany({ where: { status: "PENDING" }, orderBy: { priority: "asc" } });
    expect(queue.map((q) => q.entityType)).toEqual(expect.arrayContaining(["LEDGER", "STOCK_ITEM", "PURCHASE_INVOICE"]));
    expect(queue[0].priority).toBeLessThan(queue[queue.length - 1].priority);

    const inter = await owner.post("/api/purchase-invoices", { supplierId: f.outsider.id, supplierInvoiceNo: "SM-1", lines: [{ productId: f.wc.id, qtyPcs: 2, ratePaise: 1200000, gstRate: 18 }] });
    expect(inter.body.isInterState).toBe(true);
    expect(inter.body.igstPaise).toBe(432000);
  });

  it("debit note returns damaged stock to the supplier", async () => {
    const batch = await t.prisma.batch.findFirstOrThrow({ where: { productId: f.tile.id, shadeCode: "S1" } });
    const dn = await owner.post("/api/debit-notes", {
      supplierId: f.supplier.id,
      grnId,
      reason: "Return broken pieces",
      lines: [{ productId: f.tile.id, batchId: batch.id, godownId: t.base.mainGodown.id, fromStockType: "DAMAGED", qtyPcs: 8, ratePaise: 10000, gstRate: 18 }],
    });
    expect(dn.status, JSON.stringify(dn.body)).toBe(201);
    expect(dn.body.totalPaise).toBe(94400);
    const detail = await owner.get(`/api/stock/products/${f.tile.id}`);
    expect(detail.body.totals.damaged).toBe(0);
    // can't return more than is there
    const tooMany = await owner.post("/api/debit-notes", {
      supplierId: f.supplier.id,
      reason: "x return",
      lines: [{ productId: f.tile.id, batchId: batch.id, godownId: t.base.mainGodown.id, qtyPcs: 99999, ratePaise: 1, gstRate: 18 }],
    });
    expect(tooMany.status).toBe(400);
  });

  it("scheme progress uses posted purchase invoices of the brand", async () => {
    const today = new Date();
    const s = await owner.post("/api/schemes", {
      brandId: f.brand.id,
      name: "Kajaria Diwali target",
      periodFrom: new Date(today.getTime() - 30 * 86400000).toISOString(),
      periodTo: new Date(today.getTime() + 30 * 86400000).toISOString(),
      targetType: "VALUE",
      slabs: [
        { threshold: 1_000_000, rebatePct: 1 },
        { threshold: 10_000_000, rebatePct: 2 },
      ],
    });
    expect(s.status).toBe(201);
    const p = await owner.get(`/api/schemes/${s.body.id}/progress`);
    expect(p.body.achievedValuePaise).toBe(4_200_000);
    expect(p.body.currentSlab.rebatePct).toBe(1);
    expect(p.body.expectedRebatePaise).toBe(42_000);
    expect(p.body.nextSlab.threshold).toBe(10_000_000);
  });

  it("cancelling a posted GRN reverses its stock", async () => {
    const g = await owner.post("/api/grns", {
      supplierId: f.supplier.id,
      godownId: t.base.mainGodown.id,
      lines: [{ productId: f.wc.id, qtyPcs: 3, ratePaise: 1200000 }],
    });
    await owner.post(`/api/grns/${g.body.id}/post`);
    expect((await owner.get(`/api/stock/products/${f.wc.id}`)).body.totals.saleable).toBe(3);
    const c = await owner.post(`/api/grns/${g.body.id}/cancel`);
    expect(c.body.status).toBe("CANCELLED");
    expect((await owner.get(`/api/stock/products/${f.wc.id}`)).body.totals.saleable).toBe(0);
  });

  it("sales users cannot create GRNs", async () => {
    const sales = await loginAs(t.app, "sales@kailashceramics.com");
    const r = await sales.post("/api/grns", { supplierId: f.supplier.id, godownId: t.base.mainGodown.id, lines: [{ productId: f.wc.id, qtyPcs: 1, ratePaise: 1 }] });
    expect(r.status).toBe(403);
  });
});
