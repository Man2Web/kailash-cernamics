import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createTestApp, loginAs, TestCtx } from "./helpers";
import { fixtures, postedInvoice } from "./f4-fixtures";
import { TallyQueueService } from "../src/core/tally-queue.service";

describe("tally sync: queue, ack, retry, inbound", () => {
  let t: TestCtx;
  let f: Awaited<ReturnType<typeof fixtures>>;
  let key: string;
  const agentCall = (method: "get" | "post", url: string, body?: unknown, k = key) => {
    const r = request(t.app.getHttpServer())[method](url).set("X-Agent-Key", k).set("Idempotency-Key", randomUUID());
    return body ? r.send(body as object) : r;
  };

  beforeAll(async () => {
    t = await createTestApp();
    f = await fixtures(t.prisma, t.base.branch.id);
    const owner = await loginAs(t.app);
    const res = await owner.post("/api/tally/agents", { branchId: t.base.branch.id, name: "Office PC" });
    expect(res.status).toBe(201);
    key = res.body.apiKey;
  });
  afterAll(async () => {
    await t.app.close();
  });

  it("rejects calls without a valid agent key", async () => {
    const res = await request(t.app.getHttpServer()).get("/api/tally/queue");
    expect(res.status).toBe(401);
    const bad = await agentCall("get", "/api/tally/queue", undefined, "gcta_wrong");
    expect(bad.status).toBe(401);
  });

  it("returns masters before vouchers, and ack stores GUIDs and marks the invoice synced", async () => {
    const inv = await postedInvoice(t.prisma, { branchId: t.base.branch.id, partyId: f.customer.id, productId: f.product.id, number: "KC/CBE/26-27/0001", daysAgo: 0, totalPaise: 118_000 });
    const q = t.app.get(TallyQueueService);
    await t.prisma.$transaction((tx) => q.enqueueVoucher(tx, { entityType: "INVOICE", entityId: inv.id, branchId: t.base.branch.id, partyId: f.customer.id, productIds: [f.product.id] }));
    const pull = await agentCall("get", "/api/tally/queue?limit=50");
    expect(pull.status).toBe(200);
    expect(pull.body.items.map((i: { entityType: string }) => i.entityType)).toEqual(["LEDGER", "STOCK_ITEM", "INVOICE"]);
    const invItem = pull.body.items[2];
    expect(invItem.xml).toContain(`REMOTEID="erp-invoice-${inv.id}"`);
    expect(invItem.xml).toContain("<VOUCHERNUMBER>KC/CBE/26-27/0001</VOUCHERNUMBER>");
    expect(invItem.xml).toContain("Output CGST");

    for (const [i, it] of pull.body.items.entries()) {
      const ack = await agentCall("post", "/api/tally/ack", { queueId: it.queueId, status: "SUCCESS", tallyGuid: `guid-${i}` });
      expect(ack.status).toBe(200);
    }
    expect((await t.prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).syncStatus).toBe("SYNCED");
    expect((await t.prisma.party.findUniqueOrThrow({ where: { id: f.customer.id } })).tallyLedgerGuid).toBe("guid-0");
    expect((await t.prisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).tallyStockItemGuid).toBe("guid-1");

    // same document re-sent (retry of the same REMOTEID) never duplicates the mapping
    await t.prisma.$transaction((tx) => q.enqueue(tx, { entityType: "INVOICE", entityId: inv.id, branchId: t.base.branch.id }));
    const again = await agentCall("get", "/api/tally/queue");
    await agentCall("post", "/api/tally/ack", { queueId: again.body.items[0].queueId, status: "SUCCESS", tallyGuid: "guid-2" });
    expect(await t.prisma.tallyMapping.count({ where: { erpEntity: "INVOICE", erpId: inv.id } })).toBe(1);
  });

  it("failures back off 1/5/30 minutes then mark FAILED; retry resets", async () => {
    const inv = await postedInvoice(t.prisma, { branchId: t.base.branch.id, partyId: f.customer.id, productId: f.product.id, number: "KC/CBE/26-27/0002", daysAgo: 0, totalPaise: 59_000 });
    const q = t.app.get(TallyQueueService);
    const row = await t.prisma.$transaction((tx) => q.enqueue(tx, { entityType: "INVOICE", entityId: inv.id, branchId: t.base.branch.id }));
    const waits: number[] = [];
    for (let i = 0; i < 4; i++) {
      await t.prisma.tallySyncQueue.update({ where: { id: row.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
      const pull = await agentCall("get", "/api/tally/queue");
      const item = pull.body.items.find((x: { queueId: string }) => x.queueId === row.id);
      expect(item).toBeTruthy();
      const before = Date.now();
      const ack = await agentCall("post", "/api/tally/ack", { queueId: row.id, status: "FAILED", error: "Ledger 'Output CGST' does not exist" });
      const cur = await t.prisma.tallySyncQueue.findUniqueOrThrow({ where: { id: row.id } });
      if (i < 3) {
        expect(ack.body.status).toBe("PENDING");
        waits.push(Math.round((cur.nextAttemptAt.getTime() - before) / 60_000));
      } else {
        expect(ack.body.status).toBe("FAILED");
        expect(cur.lastError).toContain("does not exist");
      }
    }
    expect(waits).toEqual([1, 5, 30]);
    expect((await t.prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).syncStatus).toBe("FAILED");
    const owner = await loginAs(t.app);
    const retry = await owner.post(`/api/tally/sync/${row.id}/retry`);
    expect(retry.status).toBe(201);
    expect(retry.body.status).toBe("PENDING");
  });

  it("inbound receipt from Tally allocates to the invoice by bill reference, once", async () => {
    const inv = await postedInvoice(t.prisma, { branchId: t.base.branch.id, partyId: f.customer.id, productId: f.product.id, number: "KC/CBE/26-27/0050", daysAgo: 3, totalPaise: 80_000 });
    const body = {
      kind: "VOUCHER",
      lastAlterId: 345,
      items: [{ guid: "tally-rcpt-1", voucherType: "Receipt", voucherNumber: "R-12", date: "20261020", partyName: f.customer.name, amountPaise: 50_000, billRefs: [{ name: "KC/CBE/26-27/0050", amountPaise: 50_000 }] }],
    };
    const res = await agentCall("post", "/api/tally/inbound", body);
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1);
    expect(Number((await t.prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).paidPaise)).toBe(50_000);
    const again = await agentCall("post", "/api/tally/inbound", body);
    expect(again.body.skipped).toBe(1);
    expect(await t.prisma.receipt.count({ where: { tallyVoucherGuid: "tally-rcpt-1" } })).toBe(1);
    const agent = await t.prisma.tallyAgent.findFirstOrThrow();
    expect(Number(agent.lastAlterId)).toBe(345);

    const hb = await agentCall("post", "/api/tally/heartbeat", { tallyRunning: true, companyName: "Kailash Ceramics", version: "TallyPrime 5.1" });
    expect(hb.status).toBe(200);
    const recon = await (await loginAs(t.app)).get("/api/tally/reconciliation");
    expect(recon.status).toBe(200);
    expect(recon.body.rows).toHaveLength(3);
  });
});
