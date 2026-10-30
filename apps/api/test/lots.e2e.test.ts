import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, loginAs, TestCtx } from "./helpers";
import { LedgerService } from "../src/core/ledger.service";

describe("shade & lot control, analysis, reorder planner", () => {
  let t: TestCtx;
  let owner: Awaited<ReturnType<typeof loginAs>>;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTestApp();
    owner = await loginAs(t.app);
    const p = t.prisma;
    const supplier = await p.party.create({ data: { type: "SUPPLIER", name: "Kajaria Distributor", stateCode: "33" } });
    const brand = await p.brand.create({ data: { name: "Kajaria", leadTimeDays: 15, supplierId: supplier.id } });
    const cat = await p.category.create({ data: { name: "Floor tiles", type: "TILE" } });
    const size = await p.size.create({ data: { name: "600x600", lengthMm: 600, widthMm: 600 } });
    const finish = await p.finish.create({ data: { name: "Glossy" } });
    const base = { brandId: brand.id, categoryId: cat.id, sizeId: size.id, finishId: finish.id, hsn: "6907", gstRate: 18, uomType: "PIECE_BOX_AREA" as const, pcsPerBox: 4, sqftPerBox: 15.5 };
    const p1 = await p.product.create({ data: { ...base, sku: "TL-1", name: "Arizona Beige", reorderLevelPcs: 120, applications: ["FLOOR"] } });
    const p2 = await p.product.create({ data: { ...base, sku: "TL-2", name: "Arizona Grey", applications: ["FLOOR", "WALL"] } });
    const mk = (productId: string, batchNo: string, shadeCode: string, rate = 0) =>
      p.batch.create({ data: { productId, batchNo, shadeCode, caliber: "C1", grade: "PREMIUM", purchaseRatePaise: BigInt(rate), landedCostPaise: BigInt(rate) } });
    const a = await mk(p1.id, "A", "S1", 5000);
    const b = await mk(p1.id, "B", "S2");
    const c = await mk(p1.id, "C", "S3");
    const d = await mk(p2.id, "D", "G1");
    const ledger = t.app.get(LedgerService);
    const godownId = t.base.mainGodown.id;
    const branchId = t.base.branch.id;
    const entry = (productId: string, batchId: string, qtyPcs: number, refType = "GRN", postedAt = new Date(Date.now() - 40 * 86400000)) => ({
      branchId,
      productId,
      batchId,
      godownId,
      qtyPcs,
      stockType: "SALEABLE" as const,
      refType,
      refId: "seed",
      postedAt,
    });
    await p.$transaction((tx) =>
      ledger.post(tx, [entry(p1.id, a.id, 200), entry(p1.id, b.id, 48), entry(p1.id, c.id, 30), entry(p2.id, d.id, 100)]),
    );
    // 180 pcs sold from lot A in the last 90 days → 2 pcs/day
    await p.$transaction((tx) => ledger.post(tx, [entry(p1.id, a.id, -180, "INVOICE", new Date(Date.now() - 20 * 86400000))]));

    // the customer received shade S3 (lot C) last time
    const customer = await p.party.create({ data: { type: "CUSTOMER", name: "Sri Murugan Constructions", stateCode: "33" } });
    await p.invoice.create({
      data: {
        branchId,
        number: "KC/CBE/26-27/0001",
        date: new Date(Date.now() - 10 * 86400000),
        partyId: customer.id,
        placeOfSupply: "33",
        status: "POSTED",
        lines: { create: [{ productId: p1.id, batchId: c.id, godownId, hsn: "6907", qtyPcs: 20, ratePaise: 20000n, gstRate: 18 }] },
      },
    });
    Object.assign(ids, { p1: p1.id, p2: p2.id, a: a.id, b: b.id, c: c.id, d: d.id, customer: customer.id, supplier: supplier.id, brand: brand.id });
  });

  afterAll(async () => {
    await t.app.close();
  });

  it("ranks the single lot that covers the whole requirement first and flags shortfalls", async () => {
    const res = await owner.get(`/api/stock/lot-finder?productId=${ids.p1}&qty=11&unit=BOXES`);
    expect(res.status).toBe(200);
    expect(res.body.requiredPcs).toBe(44);
    expect(res.body.fittingLots).toBe(1);
    const [first, ...rest] = res.body.lots;
    expect(first).toMatchObject({ batchId: ids.b, fits: true, leftoverPcs: 4, oddLeftover: true });
    expect(rest.find((l: { batchId: string }) => l.batchId === ids.a)).toMatchObject({ fits: false, shortPcs: 24 });
  });

  it("converts sq ft with wastage to pieces", async () => {
    // 150 sq ft + 5% → 11 boxes → 44 pcs
    const res = await owner.get(`/api/stock/lot-finder?productId=${ids.p1}&qty=150&unit=SQFT&wastagePct=5`);
    expect(res.body.requiredPcs).toBe(44);
  });

  it("marks the shade the customer received last time and suggests a same-size alternative", async () => {
    const res = await owner.get(`/api/stock/lot-finder?productId=${ids.p1}&qty=11&unit=BOXES&partyId=${ids.customer}`);
    expect(res.body.lastDelivery).toMatchObject({ batchId: ids.c, shadeCode: "S3", inStockPcs: 30, coversRequirement: false });
    expect(res.body.lots.find((l: { batchId: string }) => l.batchId === ids.c).sameAsLastDelivery).toBe(true);
    expect(res.body.alternatives[0]).toMatchObject({ product: { id: ids.p2 }, lot: { batchId: ids.d } });
  });

  it("lists shade-wise stock and site history", async () => {
    const shades = await owner.get(`/api/stock/shades?productId=${ids.p1}&sort=availablePcs&dir=desc`);
    expect(shades.body.total).toBe(3);
    expect(shades.body.items[0]).toMatchObject({ id: ids.b, availablePcs: 48 });
    expect(shades.body.items.find((r: { id: string }) => r.id === ids.a).lastSoldAt).toBeTruthy();
    const hist = await owner.get(`/api/stock/site-history?partyId=${ids.customer}`);
    expect(hist.body[0]).toMatchObject({ shades: ["S3"], totalPcs: 20 });
  });

  it("totals stock by size and by application", async () => {
    const bySize = await owner.get(`/api/stock/analysis?groupBy=size`);
    const row = bySize.body.rows.find((r: { label: string }) => r.label === "600x600");
    // 98 + 100 pcs at 15.5 sq ft per 4 pcs
    expect(row.availablePcs).toBe(198);
    expect(row.sqft).toBeCloseTo(767.3, 1);
    expect(row.products).toBe(2);
    expect(row.soldSqft90).toBeCloseTo(697.5, 1);
    const byApp = await owner.get(`/api/stock/analysis?groupBy=application`);
    expect(byApp.body.overlapping).toBe(true);
    expect(byApp.body.rows.find((r: { key: string }) => r.key === "WALL").availablePcs).toBe(100);
  });

  it("suggests reorders and creates a draft PO for the preferred supplier", async () => {
    const res = await owner.get(`/api/stock/reorder?brandId=${ids.brand}`);
    expect(res.status).toBe(200);
    const group = res.body[0];
    expect(group.brand.supplier.id).toBe(ids.supplier);
    const item = group.items.find((i: { product: { id: string } }) => i.product.id === ids.p1);
    // position 98 < reorder level 120 → top up to 120, rounded to full boxes
    expect(item).toMatchObject({ availablePcs: 98, soldPcs: 180, reason: "BELOW_REORDER_LEVEL", suggestedPcs: 24, lastRatePaise: 5000 });

    const po = await owner.post(`/api/stock/reorder/purchase-order`, { supplierId: ids.supplier, lines: [{ productId: ids.p1, qtyPcs: item.suggestedPcs }] });
    expect(po.status).toBe(201);
    const saved = await t.prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.body.id }, include: { lines: true } });
    expect(saved.status).toBe("DRAFT");
    expect(saved.number).toMatch(/^PO\/CBE\//);
    expect(saved.lines[0]).toMatchObject({ qtyPcs: 24, gstRate: 18 });
    expect(Number(saved.lines[0].ratePaise)).toBe(5000);

    // now on order → covered
    const again = await owner.get(`/api/stock/reorder?brandId=${ids.brand}`);
    expect(again.body.length).toBe(0);
  });

  it("refuses the planner without purchase permission and hides cost from sales", async () => {
    const sales = await loginAs(t.app, "sales@kailashceramics.com");
    expect((await sales.get(`/api/stock/reorder`)).status).toBe(403);
    const shades = await sales.get(`/api/stock/shades?productId=${ids.p1}`);
    expect(shades.status).toBe(200);
    expect(shades.body.items[0].valuePaise).toBeUndefined();
    expect(shades.body.items[0].landedCostPaise).toBeUndefined();
  });
});
