import type { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { financialYear, formatDocNo } from "@gc/shared";
import type { seedBase } from "./base";

const DAY = 86_400_000;
const n = (v: bigint | number | null | undefined) => Number(v ?? 0);

async function nextNo(prisma: PrismaClient, branchId: string, branchCode: string, docType: string, prefix: string, date: Date) {
  const fy = financialYear(date);
  const s = await prisma.numberSeries.upsert({
    where: { branchId_docType_fy: { branchId, docType, fy } },
    create: { branchId, docType, fy, prefix, nextNo: 2 },
    update: { nextNo: { increment: 1 } },
  });
  return formatDocNo(s.prefix, branchCode, fy, s.nextNo - 1, s.padding);
}

/** Demo data for the accounts + CRM module (receipts, cheque, supplier payment, leads, visits, Tally agent). Idempotent. */
export async function seedDemoAccounts(prisma: PrismaClient, base: Awaited<ReturnType<typeof seedBase>>) {
  const branch = base.branch;
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: "admin@kailashceramics.com" } });
  const sales = await prisma.user.findUnique({ where: { email: "sales@kailashceramics.com" } });

  // ---------------------------------------------------------------- receipts against posted invoices
  if ((await prisma.receipt.count({ where: { notes: "[demo]" } })) === 0) {
    const invoices = await prisma.invoice.findMany({ where: { status: "POSTED", deletedAt: null, branchId: branch.id }, orderBy: [{ date: "asc" }], include: { party: true } });
    const open = invoices.filter((i) => n(i.totalPaise) > n(i.paidPaise));
    const plan: { mode: "CASH" | "UPI" | "CHEQUE" | "NEFT"; share: number; cheque?: boolean }[] = [
      { mode: "UPI", share: 1 },
      { mode: "CASH", share: 0.5 },
      { mode: "CHEQUE", share: 1, cheque: true },
      { mode: "NEFT", share: 1 },
    ];
    for (let i = 0; i < Math.min(plan.length, open.length); i++) {
      const inv = open[i];
      const p = plan[i];
      const amount = Math.round((n(inv.totalPaise) - n(inv.paidPaise)) * p.share);
      if (amount <= 0) continue;
      const date = new Date(Math.min(Date.now(), inv.date.getTime() + 3 * DAY));
      const number = await nextNo(prisma, branch.id, branch.code, "RECEIPT", "RC", date);
      await prisma.$transaction(async (tx) => {
        const r = await tx.receipt.create({
          data: {
            branchId: branch.id,
            number,
            date,
            partyId: inv.partyId,
            mode: p.mode,
            amountPaise: BigInt(amount),
            unallocatedPaise: 0n,
            reference: p.mode === "UPI" ? "UPI/6214XXXX" : p.mode === "NEFT" ? "UTR SBIN0026XXXX" : null,
            chequeNo: p.cheque ? "004512" : null,
            chequeDate: p.cheque ? date : null,
            bankName: p.cheque ? "Indian Bank, RS Puram" : null,
            chequeStatus: p.cheque ? "PENDING" : null,
            notes: "[demo]",
            syncStatus: "PENDING",
            createdBy: owner.id,
          },
        });
        await tx.receiptAllocation.create({ data: { receiptId: r.id, invoiceId: inv.id, amountPaise: BigInt(amount), createdBy: owner.id } });
        await tx.invoice.update({ where: { id: inv.id }, data: { paidPaise: { increment: BigInt(amount) } } });
        await tx.tallySyncQueue.create({ data: { entityType: "RECEIPT", entityId: r.id, branchId: branch.id, priority: 50 } });
      });
    }
  }
  // an advance from a customer (unallocated, shows under Outstanding as advance)
  if ((await prisma.receipt.count({ where: { notes: "[demo] advance" } })) === 0) {
    const customer = await prisma.party.findFirst({ where: { type: "CUSTOMER", deletedAt: null }, orderBy: { createdAt: "asc" } });
    if (customer) {
      const number = await nextNo(prisma, branch.id, branch.code, "RECEIPT", "RC", new Date());
      await prisma.receipt.create({
        data: { branchId: branch.id, number, date: new Date(), partyId: customer.id, mode: "UPI", amountPaise: 2_500_000n, unallocatedPaise: 2_500_000n, reference: "Advance for site order", notes: "[demo] advance", createdBy: owner.id },
      });
    }
  }

  // ---------------------------------------------------------------- supplier payment
  const pi = await prisma.purchaseInvoice.findFirst({ where: { status: "POSTED", deletedAt: null }, orderBy: { date: "asc" } });
  if (pi && (await prisma.payment.count({ where: { notes: "[demo]" } })) === 0) {
    const partyId = pi.supplierId;
    {
      const amount = Math.round((n(pi.totalPaise) - n(pi.paidPaise)) * 0.6);
      if (amount > 0) {
        const number = await nextNo(prisma, branch.id, branch.code, "PAYMENT", "PY", new Date());
        await prisma.$transaction(async (tx) => {
          const pay = await tx.payment.create({ data: { branchId: branch.id, number, date: new Date(), partyId, mode: "NEFT", reference: "UTR HDFC0007XXXX", amountPaise: BigInt(amount), notes: "[demo]", createdBy: owner.id } });
          await tx.paymentAllocation.create({ data: { paymentId: pay.id, purchaseInvoiceId: pi.id, amountPaise: BigInt(amount) } });
          await tx.purchaseInvoice.update({ where: { id: pi.id }, data: { paidPaise: { increment: BigInt(amount) } } });
        });
      }
    }
  }

  // ---------------------------------------------------------------- CRM leads
  if ((await prisma.lead.count()) === 0) {
    const today = new Date();
    const at = (days: number, hour: number) => {
      const d = new Date(today.getTime() + days * DAY);
      d.setUTCHours(hour - 5, 30, 0, 0); // hour in IST
      return d;
    };
    const architect = await prisma.influencer.findFirst({ where: { type: "ARCHITECT" } });
    const leads = [
      { name: "Mr. Ramesh Kumar", phone: "9840012345", source: "WALK_IN", status: "NEW", requirement: "3BHK flooring 600x1200 glossy, 2 bathrooms wall + floor", siteAddress: "Saravanampatti, Coimbatore", due: at(0, 11) },
      { name: "Kavya Interiors", phone: "9443300001", source: "ARCHITECT", status: "CONTACTED", requirement: "Villa project: Italian marble look tiles, 4,500 sq ft", siteAddress: "Vadavalli", due: at(0, 16), influencer: true },
      { name: "Sri Balaji Builders", phone: "9894400002", source: "CONTRACTOR", status: "QUALIFIED", requirement: "Apartment block, 24 units: parking tiles + sanitaryware sets", siteAddress: "Kalapatti", due: at(-1, 12) },
      { name: "Dr. Meena Sundaram", phone: "9789900003", source: "REFERRAL", status: "CONTACTED", requirement: "Clinic renovation, anti-skid floor, wash basins", siteAddress: "RS Puram", due: at(1, 10) },
      { name: "Anand Residence", phone: "9025500004", source: "PHONE", status: "NEW", requirement: "Kitchen backsplash highlighter tiles", siteAddress: "Peelamedu", due: at(0, 18) },
      { name: "Green Park Resort", phone: "9363300005", source: "WEBSITE", status: "QUALIFIED", requirement: "Pool deck and 12 bathrooms; Jaquar CP fittings", siteAddress: "Ooty Road, Mettupalayam", due: at(3, 11) },
      { name: "Mrs. Lakshmi Narayanan", phone: "9500600006", source: "WHATSAPP", status: "LOST", requirement: "Bathroom wall tiles", siteAddress: "Ganapathy", lostReason: "Bought from a nearby dealer at lower price" },
      { name: "Velan Constructions", phone: "9842200007", source: "CONTRACTOR", status: "WON", requirement: "Commercial complex flooring, 8,000 sq ft vitrified", siteAddress: "Avinashi Road" },
      { name: "Mr. Prakash", phone: "9976600008", source: "EXHIBITION", status: "NEW", requirement: "Elevation cladding for independent house", siteAddress: "Thudiyalur", due: at(2, 15) },
    ];
    for (const l of leads) {
      const lead = await prisma.lead.create({
        data: {
          branchId: branch.id,
          name: l.name,
          phone: l.phone,
          source: l.source,
          status: l.status as never,
          requirement: l.requirement,
          siteAddress: l.siteAddress,
          lostReason: l.lostReason ?? null,
          nextFollowupAt: l.due ?? null,
          assignedToId: sales?.id ?? owner.id,
          influencerId: l.influencer ? architect?.id ?? null : null,
          createdBy: owner.id,
        },
      });
      if (l.status !== "NEW") {
        await prisma.followup.create({ data: { leadId: lead.id, userId: lead.assignedToId, dueAt: new Date(today.getTime() - 4 * DAY), doneAt: new Date(today.getTime() - 4 * DAY), notes: "First call", outcome: "Shared catalogue on WhatsApp; customer will visit showroom" } });
      }
      if (l.due) await prisma.followup.create({ data: { leadId: lead.id, userId: lead.assignedToId, dueAt: l.due, notes: l.status === "QUALIFIED" ? "Send room-wise quotation" : "Call back about requirement" } });
      if (l.name === "Sri Balaji Builders") {
        await prisma.siteVisit.create({ data: { leadId: lead.id, userId: sales?.id ?? owner.id, lat: 11.0827, lng: 77.0016, checkInAt: new Date(today.getTime() - 2 * DAY), notes: "Measured parking area ~6,200 sq ft; wants sample boxes of 2 shades" } });
      }
    }
  }

  // ---------------------------------------------------------------- Tally agent (key not printed; rotate in Settings › Tally sync)
  if ((await prisma.tallyAgent.count()) === 0) {
    const key = `gcta_demo_${createHash("sha256").update(String(Date.now()) + Math.random()).digest("hex").slice(0, 24)}`;
    await prisma.tallyAgent.create({
      data: {
        branchId: branch.id,
        name: "Office Tally PC",
        apiKeyHash: createHash("sha256").update(key).digest("hex"),
        apiKeyPrefix: key.slice(0, 10),
        companyName: branch.tallyCompanyName ?? "Kailash Ceramics",
        tallyVersion: "TallyPrime 5.1",
        tallyRunning: true,
        lastSeenAt: new Date(Date.now() - 3 * 60_000),
        createdBy: owner.id,
      },
    });
  }
}
