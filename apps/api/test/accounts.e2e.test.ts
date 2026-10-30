import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, loginAs, TestCtx } from "./helpers";
import { fixtures, postedInvoice } from "./f4-fixtures";

describe("accounts: receipts, cheques, payments, outstanding", () => {
  let t: TestCtx;
  let f: Awaited<ReturnType<typeof fixtures>>;
  let owner: Awaited<ReturnType<typeof loginAs>>;
  beforeAll(async () => {
    t = await createTestApp();
    f = await fixtures(t.prisma, t.base.branch.id);
    owner = await loginAs(t.app);
  });
  afterAll(async () => {
    await t.app.close();
  });

  it("auto-allocates oldest invoice first and keeps the rest as advance", async () => {
    const old = await postedInvoice(t.prisma, { branchId: t.base.branch.id, partyId: f.customer.id, productId: f.product.id, number: "KC/CBE/26-27/0001", daysAgo: 40, totalPaise: 100_000 });
    const newer = await postedInvoice(t.prisma, { branchId: t.base.branch.id, partyId: f.customer.id, productId: f.product.id, number: "KC/CBE/26-27/0002", daysAgo: 5, totalPaise: 50_000 });
    const res = await owner.post("/api/receipts", { partyId: f.customer.id, mode: "UPI", amountPaise: 170_000, allocationMode: "AUTO" });
    expect(res.status).toBe(201);
    expect(res.body.number).toMatch(/^RC\/CBE\/\d{2}-\d{2}\/0001$/);
    expect(res.body.unallocatedPaise).toBe(20_000);
    const a = await t.prisma.invoice.findUniqueOrThrow({ where: { id: old.id } });
    const b = await t.prisma.invoice.findUniqueOrThrow({ where: { id: newer.id } });
    expect(Number(a.paidPaise)).toBe(100_000);
    expect(Number(b.paidPaise)).toBe(50_000);
    const q = await t.prisma.tallySyncQueue.findMany({ where: { entityId: res.body.id } });
    expect(q.map((x) => x.entityType)).toEqual(["RECEIPT"]);
    const audit = await t.prisma.auditLog.findFirst({ where: { entity: "receipt", entityId: res.body.id } });
    expect(audit).toBeTruthy();
  });

  it("manual allocation cannot exceed the invoice balance", async () => {
    const inv = await postedInvoice(t.prisma, { branchId: t.base.branch.id, partyId: f.customer.id, productId: f.product.id, number: "KC/CBE/26-27/0003", daysAgo: 2, totalPaise: 30_000 });
    const res = await owner.post("/api/receipts", { partyId: f.customer.id, mode: "CASH", amountPaise: 40_000, allocationMode: "MANUAL", allocations: [{ invoiceId: inv.id, amountPaise: 35_000 }] });
    expect(res.status).toBe(400);
  });

  it("bounced cheque reverses allocations and influencer accrual", async () => {
    const inv = await postedInvoice(t.prisma, { branchId: t.base.branch.id, partyId: f.customer.id, productId: f.product.id, number: "KC/CBE/26-27/0004", daysAgo: 1, totalPaise: 118_000, influencerId: f.influencer.id });
    const before = await t.prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    // consume any advance first so this cheque pays the new invoice fully
    const res = await owner.post("/api/receipts", { partyId: f.customer.id, mode: "CHEQUE", chequeNo: "123456", bankName: "SBI", amountPaise: 118_000, allocationMode: "MANUAL", allocations: [{ invoiceId: inv.id, amountPaise: 118_000 - Number(before.paidPaise) }] });
    expect(res.status).toBe(201);
    expect(res.body.chequeStatus).toBe("PENDING");
    const paid = await t.prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(Number(paid.paidPaise)).toBe(118_000);
    const infl = await t.prisma.influencer.findUniqueOrThrow({ where: { id: f.influencer.id } });
    expect(infl.pointsBalance).toBe(10); // ₹1,000 taxable → 10 points
    const accrual = await t.prisma.influencerLedger.findFirst({ where: { invoiceId: inv.id, kind: "ACCRUAL" } });
    expect(Number(accrual?.amountPaise)).toBe(2_000); // 2% of ₹1,000

    const bounce = await owner.post(`/api/receipts/${res.body.id}/cheque-status`, { status: "BOUNCED", note: "Insufficient funds" });
    expect(bounce.status).toBe(201);
    expect(bounce.body.status).toBe("CANCELLED");
    const after = await t.prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(Number(after.paidPaise)).toBe(0);
    expect((await t.prisma.influencer.findUniqueOrThrow({ where: { id: f.influencer.id } })).pointsBalance).toBe(0);
    const note = await t.prisma.notification.findFirst({ where: { type: "CHEQUE_BOUNCED" } });
    expect(note).toBeTruthy();
  });

  it("outstanding shows ageing buckets and overdue against credit days", async () => {
    const p2 = await t.prisma.party.create({ data: { type: "CUSTOMER", name: "Ageing Test Builders", phone: "9000000001", creditDays: 15 } });
    await postedInvoice(t.prisma, { branchId: t.base.branch.id, partyId: p2.id, productId: f.product.id, number: "KC/CBE/26-27/0101", daysAgo: 10, totalPaise: 10_000 });
    await postedInvoice(t.prisma, { branchId: t.base.branch.id, partyId: p2.id, productId: f.product.id, number: "KC/CBE/26-27/0102", daysAgo: 45, totalPaise: 20_000 });
    await postedInvoice(t.prisma, { branchId: t.base.branch.id, partyId: p2.id, productId: f.product.id, number: "KC/CBE/26-27/0103", daysAgo: 100, totalPaise: 30_000 });
    const res = await owner.get("/api/outstanding?type=CUSTOMER&q=Ageing");
    expect(res.status).toBe(200);
    const row = res.body.items[0];
    expect(row.totalPaise).toBe(60_000);
    expect(row.buckets).toEqual({ "0-30": 10_000, "31-60": 20_000, "61-90": 0, "90+": 30_000 });
    expect(row.overduePaise).toBe(50_000);
    expect(row.whatsappUrl).toContain("https://wa.me/919000000001");
    const st = await owner.get(`/api/statements/${p2.id}`);
    expect(st.body.closing).toBe(60_000);
    expect(st.body.rows).toHaveLength(3);
  });

  it("supplier payment allocates to purchase bills and sales role cannot record payments", async () => {
    const pi = await t.prisma.purchaseInvoice.create({
      data: { branchId: t.base.branch.id, number: "PI/CBE/26-27/0001", supplierInvoiceNo: "KJ-778", date: new Date(), supplierId: f.supplier.id, placeOfSupply: "33", status: "POSTED", totalPaise: 500_000n },
    });
    const res = await owner.post("/api/payments", { partyId: f.supplier.id, mode: "NEFT", amountPaise: 200_000, reference: "UTR123" });
    expect(res.status).toBe(201);
    expect(Number((await t.prisma.purchaseInvoice.findUniqueOrThrow({ where: { id: pi.id } })).paidPaise)).toBe(200_000);
    const sales = await loginAs(t.app, "sales@kailashceramics.com");
    const denied = await sales.post("/api/payments", { partyId: f.supplier.id, mode: "CASH", amountPaise: 100 });
    expect(denied.status).toBe(403);
  });
});
