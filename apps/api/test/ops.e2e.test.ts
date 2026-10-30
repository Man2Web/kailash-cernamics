import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LedgerService } from "../src/core/ledger.service";
import { invalidateUserCache } from "../src/common/guards";
import { createTestApp, loginAs, TestCtx } from "./helpers";
import { inventoryFixtures } from "./inventory-fixtures";

describe("godown operations: stock counts, labels/scan, inter-branch transit", () => {
  let t: TestCtx;
  let fx: Awaited<ReturnType<typeof inventoryFixtures>>;
  let batchA: { id: string };
  let rackA1: { id: string };
  let tpr: { id: string };
  let tprGodown: { id: string };

  const bal = async (where: Record<string, unknown>) =>
    (await t.prisma.stockBalance.aggregate({ where: { productId: fx.tile.id, ...where }, _sum: { qtyPcs: true } }))._sum.qtyPcs ?? 0;

  beforeAll(async () => {
    t = await createTestApp();
    fx = await inventoryFixtures(t.prisma);
    batchA = await t.prisma.batch.create({ data: { productId: fx.tile.id, batchNo: "KJ-01", shadeCode: "S1", caliber: "C1", landedCostPaise: 13000n } });
    rackA1 = (await t.prisma.rack.findFirst({ where: { godownId: t.base.mainGodown.id, code: "A1" } }))!;
    const ledger = t.app.get(LedgerService);
    await t.prisma.$transaction((tx) =>
      ledger.post(tx, [
        { branchId: t.base.branch.id, productId: fx.tile.id, batchId: batchA.id, godownId: t.base.mainGodown.id, rackId: rackA1.id, stockType: "SALEABLE", qtyPcs: 80, refType: "TEST", refId: "seed" },
      ]),
    );
    tpr = await t.prisma.branch.create({ data: { companyId: t.base.company.id, code: "TPR", name: "Tiruppur", stateCode: "33" } });
    tprGodown = await t.prisma.godown.create({ data: { branchId: tpr.id, code: "TPRG", name: "Tiruppur Godown" } });
    // owner sees all branches; give the manager access to Tiruppur as well
    const manager = await t.prisma.user.findUniqueOrThrow({ where: { email: "manager@kailashceramics.com" } });
    await t.prisma.userBranch.create({ data: { userId: manager.id, branchId: tpr.id } });
    invalidateUserCache();
  });
  afterAll(async () => {
    await t.app.close();
  });

  it("counts blind, hides system qty from counters, posts variance only after approval", async () => {
    const godown = await loginAs(t.app, "godown@kailashceramics.com");
    const created = await godown.post("/api/stock/counts", { godownId: t.base.mainGodown.id, rackId: rackA1.id, blind: true });
    expect(created.status).toBe(201);
    const sheet = await godown.get(`/api/stock/counts/${created.body.id}`);
    expect(sheet.body.hideSystem).toBe(true);
    expect(sheet.body.lines).toHaveLength(1);
    expect(sheet.body.lines[0].systemPcs).toBeNull();

    // 9 boxes + 6 pcs found instead of 10 boxes
    const line = sheet.body.lines[0];
    expect((await godown.patch(`/api/stock/counts/${created.body.id}/lines`, { lines: [{ lineId: line.id, countedPcs: 78 }] })).status).toBe(200);
    const submitted = await godown.post(`/api/stock/counts/${created.body.id}/submit`, {});
    expect(submitted.status).toBe(201);
    expect(submitted.body.status).toBe("PENDING_APPROVAL");
    expect(await bal({ rackId: rackA1.id, stockType: "SALEABLE" })).toBe(80);

    const owner = await loginAs(t.app);
    const full = await owner.get(`/api/stock/counts/${created.body.id}`);
    expect(full.body.variance).toMatchObject({ minusPcs: -2, linesDiffering: 1, valuePaise: -26000 });
    const approval = await t.prisma.approvalRequest.findFirstOrThrow({ where: { refType: "stock_count", refId: created.body.id } });
    expect((await owner.post(`/api/approvals/${approval.id}/decide`, { approve: true })).status).toBe(201);
    expect(await bal({ rackId: rackA1.id, stockType: "SALEABLE" })).toBe(78);
    expect((await t.prisma.stockCount.findUniqueOrThrow({ where: { id: created.body.id } })).status).toBe("POSTED");
  });

  it("refuses to submit with uncounted lines unless treated as zero", async () => {
    const godown = await loginAs(t.app, "godown@kailashceramics.com");
    const c = await godown.post("/api/stock/counts", { godownId: t.base.mainGodown.id, blind: false });
    expect((await godown.post(`/api/stock/counts/${c.body.id}/submit`, {})).status).toBe(400);
    expect((await godown.post(`/api/stock/counts/${c.body.id}/cancel`, {})).status).toBe(201);
  });

  it("resolves batch, rack and SKU scans", async () => {
    const owner = await loginAs(t.app);
    const labels = await owner.get(`/api/labels/batches?productId=${fx.tile.id}`);
    expect(labels.body[0]).toMatchObject({ qr: `GC:B:${batchA.id}`, shadeCode: "S1", pcsPerBox: 8 });
    const b = await owner.get(`/api/scan/resolve?code=${encodeURIComponent(`GC:B:${batchA.id}`)}`);
    expect(b.body.kind).toBe("BATCH");
    expect(b.body.totals.saleable).toBe(78);
    expect(b.body.batch.landedCostPaise).toBeDefined();
    const r = await owner.get(`/api/scan/resolve?code=${encodeURIComponent(`GC:R:${rackA1.id}`)}`);
    expect(r.body.kind).toBe("RACK");
    expect(r.body.items[0].qtyPcs).toBe(78);
    const s = await owner.get(`/api/scan/resolve?code=tl-kj-3060-wd`);
    expect(s.body.kind).toBe("PRODUCT");
    expect((await owner.get(`/api/scan/resolve?code=NOPE`)).status).toBe(404);
  });

  it("inter-branch transfer sits in transit at the destination, receipt books damage and shortage as transit breakage", async () => {
    const manager = await loginAs(t.app, "manager@kailashceramics.com");
    const sent = await manager.post("/api/stock/transfers", {
      fromGodownId: t.base.mainGodown.id,
      toGodownId: tprGodown.id,
      vehicleNo: "TN 37 AB 1234",
      lines: [{ productId: fx.tile.id, batchId: batchA.id, qtyPcs: 40 }],
    });
    expect(sent.status).toBe(201);
    expect(sent.body.transitState).toBe("IN_TRANSIT");
    expect(await bal({ branchId: t.base.branch.id, stockType: "SALEABLE" })).toBe(38);
    expect(await bal({ branchId: tpr.id, stockType: "IN_TRANSIT" })).toBe(40);

    // the source branch cannot receive it
    const lineId = (await t.prisma.stockTransferLine.findFirstOrThrow({ where: { transferId: sent.body.id } })).id;
    const wrong = await manager.post(`/api/stock/transfers/${sent.body.id}/receive`, { lines: [{ lineId, receivedPcs: 36, damagedPcs: 2 }] });
    expect(wrong.status).toBe(400);

    const incoming = await manager.agent.get("/api/stock/transfers?direction=incoming").set("X-Branch-Id", tpr.id);
    expect(incoming.body.total).toBe(1);
    const detail = await manager.agent.get(`/api/stock/transfers/${sent.body.id}`).set("X-Branch-Id", tpr.id);
    expect(detail.body.canReceive).toBe(true);
    expect(detail.body.totalWeightKg).toBe(132.5);

    const recv = await manager.agent
      .post(`/api/stock/transfers/${sent.body.id}/receive`)
      .set("X-Branch-Id", tpr.id)
      .set("Idempotency-Key", "recv-key-0001")
      .send({ lines: [{ lineId, receivedPcs: 36, damagedPcs: 2 }] });
    expect(recv.status).toBe(201);
    expect(recv.body.transitState).toBe("RECEIVED");
    expect(await bal({ branchId: tpr.id, stockType: "IN_TRANSIT" })).toBe(0);
    expect(await bal({ branchId: tpr.id, stockType: "SALEABLE" })).toBe(36);
    expect(await bal({ branchId: tpr.id, stockType: "DAMAGED" })).toBe(2);
    const bk = await t.prisma.breakageEntry.findFirstOrThrow({ where: { refId: sent.body.id } });
    expect(bk).toMatchObject({ stage: "TRANSIT", qtyPcs: 4, branchId: tpr.id });

    // received transfers can't be cancelled
    expect((await manager.post(`/api/stock/transfers/${sent.body.id}/cancel`, {})).status).toBe(400);
  });

  it("cancelling an in-transit transfer restores the source", async () => {
    const manager = await loginAs(t.app, "manager@kailashceramics.com");
    const sent = await manager.post("/api/stock/transfers", { fromGodownId: t.base.mainGodown.id, toGodownId: tprGodown.id, lines: [{ productId: fx.tile.id, batchId: batchA.id, qtyPcs: 8 }] });
    expect(sent.status).toBe(201);
    expect(await bal({ branchId: t.base.branch.id, stockType: "SALEABLE" })).toBe(30);
    expect((await manager.post(`/api/stock/transfers/${sent.body.id}/cancel`, {})).status).toBe(201);
    expect(await bal({ branchId: t.base.branch.id, stockType: "SALEABLE" })).toBe(38);
    expect(await bal({ branchId: tpr.id, stockType: "IN_TRANSIT" })).toBe(0);
  });

  it("stock summary shows in-transit stock at the destination branch", async () => {
    const manager = await loginAs(t.app, "manager@kailashceramics.com");
    await manager.post("/api/stock/transfers", { fromGodownId: t.base.mainGodown.id, toGodownId: tprGodown.id, lines: [{ productId: fx.tile.id, batchId: batchA.id, qtyPcs: 8 }] });
    const sum = await manager.agent.get(`/api/stock/summary?q=TL-KJ`).set("X-Branch-Id", tpr.id);
    const row = sum.body.items.find((r: { id: string }) => r.id === fx.tile.id);
    expect(row.inTransit).toBe(8);
    expect(row.saleable).toBe(36);
  });
});
