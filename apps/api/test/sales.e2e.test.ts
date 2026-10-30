import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, loginAs, TestCtx } from "./helpers";
import { LedgerService } from "../src/core/ledger.service";

describe("sales: quotation → order → invoice, returns", () => {
  let t: TestCtx;
  let owner: Awaited<ReturnType<typeof loginAs>>;
  const ids: Record<string, string> = {};

  const balance = async (productId: string, batchId: string, stockType: string) =>
    (await t.prisma.stockBalance.aggregate({ where: { productId, batchId, stockType: stockType as never }, _sum: { qtyPcs: true } }))._sum.qtyPcs ?? 0;

  beforeAll(async () => {
    t = await createTestApp();
    owner = await loginAs(t.app);
    const p = t.prisma;
    const brand = await p.brand.create({ data: { name: "Kajaria" } });
    const tiles = await p.category.create({ data: { name: "Floor tiles", type: "TILE" } });
    const sanitary = await p.category.create({ data: { name: "WC", type: "SANITARY" } });
    const tile = await p.product.create({
      data: { sku: "TL-KJ-6012-CAL", name: "Calacatta Gold Glossy", brandId: brand.id, categoryId: tiles.id, hsn: "6907", gstRate: 18, uomType: "PIECE_BOX_AREA", pcsPerBox: 2, sqftPerBox: 15.5, mrpPaise: 248000n },
    });
    const wc = await p.product.create({
      data: { sku: "SN-HW-WC-ONE", name: "One-piece WC", brandId: brand.id, categoryId: sanitary.id, hsn: "6910", gstRate: 18, uomType: "UNIT", mrpPaise: 1850000n },
    });
    const local = await p.party.create({ data: { type: "CUSTOMER", segment: "CONTRACTOR", name: "Sri Murugan Constructions", phone: "9843012345", stateCode: "33" } });
    const kerala = await p.party.create({ data: { type: "CUSTOMER", name: "Kochi Interiors", stateCode: "32" } });
    const site = await p.site.create({ data: { partyId: local.id, name: "RS Puram villa" } });
    const batchA = await p.batch.create({ data: { productId: tile.id, batchNo: "B-A", shadeCode: "S1", caliber: "C1", grade: "PREMIUM" } });
    const batchB = await p.batch.create({ data: { productId: tile.id, batchNo: "B-B", shadeCode: "S2", caliber: "C1", grade: "PREMIUM" } });
    const ledger = t.app.get(LedgerService);
    const g = t.base.mainGodown.id;
    const b = t.base.branch.id;
    await t.prisma.tx(async (tx) => {
      const wcBatch = await ledger.defaultBatch(tx, wc.id);
      ids.wcBatch = wcBatch.id;
      await ledger.post(tx, [
        { branchId: b, productId: tile.id, batchId: batchA.id, godownId: g, qtyPcs: 40, stockType: "SALEABLE", refType: "OPENING", refId: "test" },
        { branchId: b, productId: tile.id, batchId: batchB.id, godownId: g, qtyPcs: 10, stockType: "SALEABLE", refType: "OPENING", refId: "test" },
        { branchId: b, productId: wc.id, batchId: wcBatch.id, godownId: g, qtyPcs: 5, stockType: "SALEABLE", refType: "OPENING", refId: "test" },
      ]);
    });
    Object.assign(ids, { tile: tile.id, wc: wc.id, local: local.id, kerala: kerala.id, site: site.id, batchA: batchA.id, batchB: batchB.id });
  });

  afterAll(async () => {
    await t.app.close();
  });

  it("room-wise quotation computes area, boxes and GST on the server", async () => {
    const res = await owner.post("/api/quotations", {
      partyId: ids.local,
      siteId: ids.site,
      transportPaise: 50000,
      rooms: [
        { name: "Living", lengthFt: 12, widthFt: 10, areas: [{ areaType: "FLOOR", productId: ids.tile, priceBasis: "PER_SQFT", enteredRatePaise: 8000 }] },
        { name: "Bath", lengthFt: 8, widthFt: 6, heightFt: 7, deductionsSqft: 21, areas: [{ areaType: "WALL", wastagePct: 8, productId: ids.tile, priceBasis: "PER_BOX", enteredRatePaise: 124000 }] },
      ],
      items: [{ productId: ids.wc, qtyPcs: 1, priceBasis: "PER_UNIT", enteredRatePaise: 1850000 }],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const q = res.body;
    expect(q.number).toMatch(/^QT\/CBE\/\d{2}-\d{2}\/0001$/);
    const floor = q.rooms[0].areas[0];
    expect(floor.areaSqft).toBe(120);
    expect(floor.wastagePct).toBe(5);
    expect(floor.lines[0]).toMatchObject({ qtyPcs: 18, boxes: 9, loosePcs: 0, ratePaise: 62000 });
    const wall = q.rooms[1].areas[0];
    expect(wall.areaSqft).toBe(175); // 2 × 14 × 7 − 21
    expect(wall.lines[0].boxes).toBe(13); // 175 × 1.08 / 15.5 = 12.19 → 13
    expect(q.cgstPaise).toBe(q.sgstPaise);
    expect(q.igstPaise).toBe(0);
    expect(q.totalPaise % 100).toBe(0);
    ids.quote = q.id;
  });

  it("revision keeps the number and bumps the revision", async () => {
    const res = await owner.post(`/api/quotations/${ids.quote}/revise`);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.revisionNo).toBe(2);
    expect(res.body.number).toMatch(/0001$/);
    ids.quote = res.body.id;
    const share = await owner.get(`/api/quotations/${ids.quote}/share`);
    expect(share.body.whatsappUrl).toContain("wa.me/919843012345");
  });

  it("converts to an order that reserves each line from one batch", async () => {
    const conv = await owner.post(`/api/quotations/${ids.quote}/convert`);
    expect(conv.status, JSON.stringify(conv.body)).toBe(201);
    // keep only the floor line for this test
    const order = conv.body;
    const floorLine = order.lines.find((l: any) => l.qtyPcs === 18);
    const upd = await owner.patch(`/api/sales-orders/${order.id}`, {
      partyId: ids.local,
      siteId: ids.site,
      confirm: true,
      lines: [{ productId: ids.tile, qtyPcs: 18, priceBasis: "PER_UNIT", enteredRatePaise: Number(floorLine.ratePaise), discountPct: 0 }],
    });
    expect(upd.status, JSON.stringify(upd.body)).toBe(200);
    expect(upd.body.status).toBe("APPROVED");
    expect(upd.body.lines[0].batchId).toBe(ids.batchA);
    expect(await balance(ids.tile, ids.batchA, "RESERVED")).toBe(18);
    ids.order = order.id;
  });

  it("returns available batches when one batch is short", async () => {
    const res = await owner.post("/api/sales-orders", {
      partyId: ids.local,
      confirm: true,
      lines: [{ productId: ids.tile, qtyPcs: 30, priceBasis: "PER_BOX", enteredRatePaise: 124000 }],
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("BATCH_SHORT");
    expect(res.body.batches.map((b: any) => b.available).sort((a: number, b: number) => a - b)).toEqual([10, 22]);
  });

  it("invoices the order: number series, CGST/SGST, stock out, reservation released, Tally queued", async () => {
    const draft = await owner.post(`/api/sales-orders/${ids.order}/invoice`);
    expect(draft.status, JSON.stringify(draft.body)).toBe(201);
    const posted = await owner.post(`/api/invoices/${draft.body.id}/post`);
    expect(posted.status, JSON.stringify(posted.body)).toBe(201);
    const inv = posted.body;
    expect(inv.number).toMatch(/^KC\/CBE\/\d{2}-\d{2}\/0001$/);
    expect(inv.status).toBe("POSTED");
    expect(inv.isInterState).toBe(false);
    expect(inv.cgstPaise).toBeGreaterThan(0);
    expect(inv.cgstPaise).toBe(inv.sgstPaise);
    expect(inv.igstPaise).toBe(0);
    expect(await balance(ids.tile, ids.batchA, "SALEABLE")).toBe(22);
    expect(await balance(ids.tile, ids.batchA, "RESERVED")).toBe(0);
    const q = await t.prisma.tallySyncQueue.findMany({ where: { entityId: inv.id } });
    expect(q.map((x) => x.entityType)).toContain("INVOICE");
    const order = await owner.get(`/api/sales-orders/${ids.order}`);
    expect(order.body.status).toBe("COMPLETED");
    ids.invoice = inv.id;
  });

  it("inter-state invoice uses IGST", async () => {
    const res = await owner.post("/api/invoices", {
      partyId: ids.kerala,
      post: true,
      lines: [{ productId: ids.wc, qtyPcs: 2, priceBasis: "PER_UNIT", enteredRatePaise: 1850000 }],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.isInterState).toBe(true);
    expect(res.body.igstPaise).toBe(666000);
    expect(res.body.cgstPaise).toBe(0);
    expect(res.body.number).toMatch(/0002$/);
    ids.igstInvoice = res.body.id;
  });

  it("cancelling a posted invoice reverses stock and keeps the number", async () => {
    const res = await owner.post(`/api/invoices/${ids.invoice}/cancel`, { reason: "Wrong shade billed" });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.status).toBe("CANCELLED");
    expect(res.body.number).toMatch(/0001$/);
    expect(await balance(ids.tile, ids.batchA, "SALEABLE")).toBe(40);
    expect(await balance(ids.tile, ids.batchA, "RESERVED")).toBe(18); // order holds its stock again
    const q = await t.prisma.tallySyncQueue.findFirst({ where: { entityId: ids.invoice, entityType: "INVOICE_CANCEL" } });
    expect(q).toBeTruthy();
    const again = await owner.post(`/api/invoices/${ids.invoice}/cancel`, { reason: "twice" });
    expect(again.status).toBe(400);
  });

  it("discount above the role limit goes to approval, and approval confirms the order", async () => {
    const sales = await loginAs(t.app, "sales@kailashceramics.com");
    const res = await sales.post("/api/sales-orders", {
      partyId: ids.local,
      confirm: true,
      lines: [{ productId: ids.tile, qtyPcs: 4, priceBasis: "PER_BOX", enteredRatePaise: 124000, discountPct: 10 }],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.status).toBe("PENDING_APPROVAL");
    const appr = await t.prisma.approvalRequest.findFirst({ where: { refId: res.body.id, type: "DISCOUNT" } });
    expect(appr?.status).toBe("PENDING");
    const decided = await owner.post(`/api/approvals/${appr!.id}/decide`, { approve: true });
    expect(decided.status, JSON.stringify(decided.body)).toBe(201);
    const order = await owner.get(`/api/sales-orders/${res.body.id}`);
    expect(order.body.status).toBe("APPROVED");
    expect(order.body.lines[0].batchId).toBeTruthy();
  });

  it("direct invoice with a discount above the role limit cannot be posted", async () => {
    const sales = await loginAs(t.app, "sales@kailashceramics.com");
    const draft = await sales.post("/api/invoices", {
      partyId: ids.local,
      lines: [{ productId: ids.wc, qtyPcs: 1, priceBasis: "PER_UNIT", enteredRatePaise: 1850000, discountPct: 12 }],
    });
    expect(draft.status, JSON.stringify(draft.body)).toBe(201);
    const posted = await sales.post(`/api/invoices/${draft.body.id}/post`, {});
    expect(posted.status).toBe(400);
    expect(posted.body.message).toMatch(/Discount above your limit of 5%/);
    const after = await t.prisma.invoice.findUniqueOrThrow({ where: { id: draft.body.id } });
    expect(after.status).toBe("DRAFT");
    expect(after.number).toBeNull();
  });

  it("return to DAMAGED moves stock and raises a credit note with IGST", async () => {
    const inv = await owner.get(`/api/invoices/${ids.igstInvoice}`);
    const res = await owner.post("/api/sales-returns", {
      invoiceId: ids.igstInvoice,
      reason: "Cracked in transit",
      lines: [{ invoiceLineId: inv.body.lines[0].id, qtyPcs: 1, toStockType: "DAMAGED" }],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.creditNote.igstPaise).toBe(333000);
    expect(res.body.creditNote.totalPaise).toBe(2183000);
    expect(await balance(ids.wc, ids.wcBatch, "DAMAGED")).toBe(1);
    const tooMany = await owner.post("/api/sales-returns", {
      invoiceId: ids.igstInvoice,
      lines: [{ invoiceLineId: inv.body.lines[0].id, qtyPcs: 2, toStockType: "SALEABLE" }],
    });
    expect(tooMany.status).toBe(400);
  });

  it("challan + dispatch + delivery for a posted invoice", async () => {
    const c = await owner.post("/api/challans", { invoiceId: ids.igstInvoice });
    expect(c.status, JSON.stringify(c.body)).toBe(201);
    expect(c.body.number).toMatch(/^DC\/CBE/);
    const d = await owner.post(`/api/challans/${c.body.id}/dispatch`, { vehicleNo: "TN 37 AB 1234", driverName: "Ravi", loadingPaise: 20000 });
    expect(d.status, JSON.stringify(d.body)).toBe(201);
    const del = await owner.post(`/api/dispatches/${d.body.id}/deliver`, { podPhoto: "/api/files/pod/x.jpg" });
    expect(del.status).toBe(201);
    const got = await owner.get(`/api/challans/${c.body.id}`);
    expect(got.body.status).toBe("COMPLETED");
  });
});
