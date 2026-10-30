import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  ageingBucket,
  AccountsOutstandingRow,
  AccountsPaymentCreate,
  AccountsReceiptCreate,
  daysBetween,
  formatINR,
} from "@gc/shared";
import { PrismaService, Tx } from "../../prisma/prisma.service";
import { AuditService } from "../../core/audit.service";
import { NumberingService } from "../../core/numbering.service";
import { TallyQueueService } from "../../core/tally-queue.service";
import { ctx, stampCreate, stampUpdate } from "../../common/context";

const n = (v: bigint | number | null | undefined) => Number(v ?? 0);

/** Normalise an Indian mobile number for wa.me links. */
export function waPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return digits.length >= 10 ? digits : null;
}

export function reminderUrl(phone: string | null | undefined, name: string, duePaise: number): string | null {
  const p = waPhone(phone);
  if (!p || duePaise <= 0) return null;
  const text = `Dear ${name}, this is a gentle reminder from Kailash Ceramics that ${formatINR(duePaise)} is outstanding on your account. Kindly arrange payment at the earliest. Thank you.`;
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly tally: TallyQueueService,
  ) {}

  // ------------------------------------------------------------------ receipts

  async createReceipt(branchId: string, input: AccountsReceiptCreate, source = "ERP") {
    return this.prisma.tx(async (tx) => {
      const party = await tx.party.findFirst({ where: { id: input.partyId, deletedAt: null } });
      if (!party) throw new NotFoundException("Customer not found");
      if (party.type === "SUPPLIER") throw new BadRequestException("Receipts are for customers; use Payments for suppliers");
      const date = input.date ?? new Date();
      const number = await this.numbering.next(tx, branchId, "RECEIPT", date);
      const receipt = await tx.receipt.create({
        data: {
          branchId,
          number,
          date,
          partyId: party.id,
          mode: input.mode,
          reference: input.reference ?? null,
          amountPaise: BigInt(input.amountPaise),
          unallocatedPaise: BigInt(input.amountPaise),
          chequeNo: input.chequeNo ?? null,
          chequeDate: input.chequeDate ?? null,
          bankName: input.bankName ?? null,
          chequeStatus: input.mode === "CHEQUE" ? "PENDING" : null,
          notes: input.notes ?? null,
          source,
          ...stampCreate(),
        },
      });
      if (input.allocationMode === "AUTO") await this.allocateAuto(tx, receipt.id);
      else if (input.allocationMode === "MANUAL") await this.allocateManual(tx, receipt.id, input.allocations);
      if (source === "ERP") {
        await this.tally.enqueueVoucher(tx, { entityType: "RECEIPT", entityId: receipt.id, branchId, partyId: party.id });
        await tx.receipt.update({ where: { id: receipt.id }, data: { syncStatus: "PENDING" } });
      }
      const full = await tx.receipt.findUniqueOrThrow({ where: { id: receipt.id }, include: { allocations: true } });
      await this.audit.log({ entity: "receipt", entityId: receipt.id, action: "create", after: full }, tx);
      return full;
    });
  }

  /** Allocate the receipt's unallocated amount to the party's oldest open invoices. */
  async allocateAuto(tx: Tx, receiptId: string) {
    const r = await tx.receipt.findUniqueOrThrow({ where: { id: receiptId } });
    let left = n(r.unallocatedPaise);
    if (left <= 0) return;
    const invoices = await tx.invoice.findMany({
      where: { partyId: r.partyId, status: "POSTED", deletedAt: null },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    });
    for (const inv of invoices) {
      if (left <= 0) break;
      const due = n(inv.totalPaise) - n(inv.paidPaise);
      if (due <= 0) continue;
      const amt = Math.min(due, left);
      await this.applyAllocation(tx, r.id, inv.id, amt);
      left -= amt;
    }
    await tx.receipt.update({ where: { id: r.id }, data: { unallocatedPaise: BigInt(left) } });
  }

  async allocateManual(tx: Tx, receiptId: string, allocations: { invoiceId: string; amountPaise: number }[]) {
    const r = await tx.receipt.findUniqueOrThrow({ where: { id: receiptId } });
    let left = n(r.unallocatedPaise);
    for (const a of allocations) {
      const inv = await tx.invoice.findFirst({ where: { id: a.invoiceId, partyId: r.partyId, status: "POSTED", deletedAt: null } });
      if (!inv) throw new BadRequestException("Invoice is not an open invoice of this customer");
      const due = n(inv.totalPaise) - n(inv.paidPaise);
      if (a.amountPaise > due) throw new BadRequestException(`Allocation to ${inv.number} is more than its balance ${formatINR(due)}`);
      if (a.amountPaise > left) throw new BadRequestException("Allocated more than the receipt amount");
      await this.applyAllocation(tx, r.id, inv.id, a.amountPaise);
      left -= a.amountPaise;
    }
    await tx.receipt.update({ where: { id: r.id }, data: { unallocatedPaise: BigInt(left) } });
  }

  private async applyAllocation(tx: Tx, receiptId: string, invoiceId: string, amountPaise: number) {
    await tx.receiptAllocation.create({ data: { receiptId, invoiceId, amountPaise: BigInt(amountPaise), ...stampCreate() } });
    const inv = await tx.invoice.update({ where: { id: invoiceId }, data: { paidPaise: { increment: BigInt(amountPaise) } } });
    if (n(inv.paidPaise) >= n(inv.totalPaise)) await this.accrueInfluencer(tx, inv.id);
  }

  /** Influencer commission/points accrue only when the invoice is fully paid. */
  async accrueInfluencer(tx: Tx, invoiceId: string) {
    const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { influencer: true } });
    if (!inv.influencerId || !inv.influencer) return;
    const accrued = await tx.influencerLedger.findFirst({ where: { invoiceId, kind: "ACCRUAL", deletedAt: null } });
    const reversed = await tx.influencerLedger.findFirst({ where: { invoiceId, kind: "REVERSAL", deletedAt: null, createdAt: { gt: accrued?.createdAt ?? new Date(0) } } });
    if (accrued && !reversed) return;
    const taxable = n(inv.taxablePaise);
    const amountPaise = Math.round((taxable * (inv.influencer.commissionPct || 0)) / 100);
    const points = Math.floor(taxable / 10000); // 1 point per ₹100 of taxable value
    await tx.influencerLedger.create({
      data: { influencerId: inv.influencerId, invoiceId, kind: "ACCRUAL", points, amountPaise: BigInt(amountPaise), note: `Invoice ${inv.number} fully paid`, ...stampCreate() },
    });
    await tx.influencer.update({ where: { id: inv.influencerId }, data: { pointsBalance: { increment: points } } });
  }

  /** Undo a receipt's allocations (cancel or cheque bounce); reverses influencer accruals that no longer hold. */
  private async reverseAllocations(tx: Tx, receiptId: string) {
    const allocs = await tx.receiptAllocation.findMany({ where: { receiptId, deletedAt: null } });
    for (const a of allocs) {
      const before = await tx.invoice.findUniqueOrThrow({ where: { id: a.invoiceId } });
      const wasPaid = n(before.paidPaise) >= n(before.totalPaise);
      const inv = await tx.invoice.update({ where: { id: a.invoiceId }, data: { paidPaise: { decrement: a.amountPaise } } });
      if (wasPaid && n(inv.paidPaise) < n(inv.totalPaise) && inv.influencerId) {
        const acc = await tx.influencerLedger.findFirst({ where: { invoiceId: inv.id, kind: "ACCRUAL", deletedAt: null }, orderBy: { createdAt: "desc" } });
        if (acc) {
          await tx.influencerLedger.create({
            data: { influencerId: inv.influencerId, invoiceId: inv.id, kind: "REVERSAL", points: -acc.points, amountPaise: -acc.amountPaise, note: `Payment on ${inv.number} reversed`, ...stampCreate() },
          });
          await tx.influencer.update({ where: { id: inv.influencerId }, data: { pointsBalance: { decrement: acc.points } } });
        }
      }
      await tx.receiptAllocation.update({ where: { id: a.id }, data: { deletedAt: new Date(), ...stampUpdate() } });
    }
  }

  async allocateAdvance(id: string) {
    return this.prisma.tx(async (tx) => {
      const before = await this.receiptOrThrow(tx, id);
      if (before.status !== "POSTED") throw new BadRequestException("Only posted receipts can be allocated");
      await this.allocateAuto(tx, id);
      const after = await tx.receipt.findUniqueOrThrow({ where: { id }, include: { allocations: { where: { deletedAt: null } } } });
      await this.audit.log({ entity: "receipt", entityId: id, action: "allocate", before, after }, tx);
      return after;
    });
  }

  async cancelReceipt(id: string, reason: string) {
    return this.prisma.tx(async (tx) => {
      const before = await this.receiptOrThrow(tx, id);
      if (before.status === "CANCELLED") throw new BadRequestException("Receipt is already cancelled");
      await this.reverseAllocations(tx, id);
      const after = await tx.receipt.update({
        where: { id },
        data: { status: "CANCELLED", unallocatedPaise: 0n, notes: [before.notes, `Cancelled: ${reason}`].filter(Boolean).join("\n"), ...stampUpdate() },
      });
      if (before.syncStatus !== "NOT_QUEUED") await this.tally.enqueue(tx, { entityType: "RECEIPT_CANCEL", entityId: id, branchId: before.branchId });
      await this.audit.log({ entity: "receipt", entityId: id, action: "cancel", before, after }, tx);
      return after;
    });
  }

  async setChequeStatus(id: string, status: "PENDING" | "DEPOSITED" | "CLEARED" | "BOUNCED", note?: string) {
    return this.prisma.tx(async (tx) => {
      const before = await this.receiptOrThrow(tx, id);
      if (before.mode !== "CHEQUE") throw new BadRequestException("Not a cheque receipt");
      if (before.chequeStatus === "BOUNCED") throw new BadRequestException("This cheque has already bounced");
      const data: Prisma.ReceiptUpdateInput = { chequeStatus: status, ...stampUpdate() };
      if (status === "BOUNCED") {
        await this.reverseAllocations(tx, id);
        data.status = "CANCELLED";
        data.unallocatedPaise = 0n;
        data.notes = [before.notes, `Cheque bounced${note ? `: ${note}` : ""}`].filter(Boolean).join("\n");
        if (before.syncStatus !== "NOT_QUEUED") await this.tally.enqueue(tx, { entityType: "RECEIPT_CANCEL", entityId: id, branchId: before.branchId });
        const party = await tx.party.findUniqueOrThrow({ where: { id: before.partyId } });
        const notify = await tx.user.findMany({
          where: { isActive: true, deletedAt: null, role: { code: { in: ["OWNER", "ACCOUNTS", "BRANCH_MANAGER"] } } },
          select: { id: true },
        });
        await tx.notification.createMany({
          data: notify.map((u) => ({
            userId: u.id,
            type: "CHEQUE_BOUNCED",
            title: `Cheque ${before.chequeNo} bounced`,
            body: `${party.name} · ${formatINR(n(before.amountPaise))} · receipt ${before.number}`,
            link: `/accounts/receipts/${id}`,
          })),
        });
      }
      const after = await tx.receipt.update({ where: { id }, data });
      await this.audit.log({ entity: "receipt", entityId: id, action: `cheque_${status.toLowerCase()}`, before, after }, tx);
      return after;
    });
  }

  private async receiptOrThrow(tx: Tx, id: string) {
    const r = await tx.receipt.findFirst({ where: { id, deletedAt: null } });
    if (!r) throw new NotFoundException("Receipt not found");
    return r;
  }

  // ------------------------------------------------------------------ supplier payments

  async createPayment(branchId: string, input: AccountsPaymentCreate) {
    return this.prisma.tx(async (tx) => {
      const party = await tx.party.findFirst({ where: { id: input.partyId, deletedAt: null } });
      if (!party) throw new NotFoundException("Supplier not found");
      if (party.type === "CUSTOMER") throw new BadRequestException("Payments are for suppliers; use Receipts for customers");
      const date = input.date ?? new Date();
      const number = await this.numbering.next(tx, branchId, "PAYMENT", date);
      const payment = await tx.payment.create({
        data: {
          branchId,
          number,
          date,
          partyId: party.id,
          mode: input.mode,
          reference: input.reference ?? null,
          amountPaise: BigInt(input.amountPaise),
          notes: input.notes ?? null,
          ...stampCreate(),
        },
      });
      let left = input.amountPaise;
      const apply = async (piId: string, amt: number) => {
        await tx.paymentAllocation.create({ data: { paymentId: payment.id, purchaseInvoiceId: piId, amountPaise: BigInt(amt), ...stampCreate() } });
        await tx.purchaseInvoice.update({ where: { id: piId }, data: { paidPaise: { increment: BigInt(amt) } } });
        left -= amt;
      };
      if (input.allocationMode === "AUTO") {
        const open = await tx.purchaseInvoice.findMany({ where: { supplierId: party.id, status: "POSTED", deletedAt: null }, orderBy: [{ date: "asc" }, { createdAt: "asc" }] });
        for (const pi of open) {
          if (left <= 0) break;
          const due = n(pi.totalPaise) - n(pi.paidPaise);
          if (due > 0) await apply(pi.id, Math.min(due, left));
        }
      } else if (input.allocationMode === "MANUAL") {
        for (const a of input.allocations) {
          const pi = await tx.purchaseInvoice.findFirst({ where: { id: a.purchaseInvoiceId, supplierId: party.id, status: "POSTED", deletedAt: null } });
          if (!pi) throw new BadRequestException("Purchase invoice is not an open bill of this supplier");
          const due = n(pi.totalPaise) - n(pi.paidPaise);
          if (a.amountPaise > due) throw new BadRequestException(`Allocation to ${pi.supplierInvoiceNo} is more than its balance`);
          if (a.amountPaise > left) throw new BadRequestException("Allocated more than the payment amount");
          await apply(pi.id, a.amountPaise);
        }
      }
      await this.tally.enqueueVoucher(tx, { entityType: "PAYMENT", entityId: payment.id, branchId, partyId: party.id });
      const full = await tx.payment.update({ where: { id: payment.id }, data: { syncStatus: "PENDING" }, include: { allocations: true } });
      await this.audit.log({ entity: "payment", entityId: payment.id, action: "create", after: full }, tx);
      return full;
    });
  }

  async cancelPayment(id: string, reason: string) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.payment.findFirst({ where: { id, deletedAt: null }, include: { allocations: { where: { deletedAt: null } } } });
      if (!before) throw new NotFoundException("Payment not found");
      if (before.status === "CANCELLED") throw new BadRequestException("Payment is already cancelled");
      for (const a of before.allocations) {
        await tx.purchaseInvoice.update({ where: { id: a.purchaseInvoiceId }, data: { paidPaise: { decrement: a.amountPaise } } });
        await tx.paymentAllocation.update({ where: { id: a.id }, data: { deletedAt: new Date() } });
      }
      const after = await tx.payment.update({
        where: { id },
        data: { status: "CANCELLED", notes: [before.notes, `Cancelled: ${reason}`].filter(Boolean).join("\n"), ...stampUpdate() },
      });
      await this.tally.enqueue(tx, { entityType: "PAYMENT_CANCEL", entityId: id, branchId: before.branchId });
      await this.audit.log({ entity: "payment", entityId: id, action: "cancel", before, after }, tx);
      return after;
    });
  }

  // ------------------------------------------------------------------ outstanding

  async outstanding(type: "CUSTOMER" | "SUPPLIER", q?: string, branchId?: string): Promise<{ rows: AccountsOutstandingRow[]; summary: Record<string, number> }> {
    const partyWhere: Prisma.PartyWhereInput = {
      deletedAt: null,
      type: { in: type === "CUSTOMER" ? ["CUSTOMER", "BOTH"] : ["SUPPLIER", "BOTH"] },
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] } : {}),
    };
    const parties = await this.prisma.party.findMany({ where: partyWhere });
    const ids = parties.map((p) => p.id);
    type Doc = { partyId: string; date: Date; due: number };
    let docs: Doc[] = [];
    const advance = new Map<string, number>();
    if (type === "CUSTOMER") {
      const inv = await this.prisma.invoice.findMany({
        where: { partyId: { in: ids }, status: "POSTED", deletedAt: null, ...(branchId ? { branchId } : {}) },
        select: { partyId: true, date: true, totalPaise: true, paidPaise: true },
      });
      docs = inv.map((i) => ({ partyId: i.partyId, date: i.date, due: n(i.totalPaise) - n(i.paidPaise) }));
      const rc = await this.prisma.receipt.groupBy({ by: ["partyId"], where: { partyId: { in: ids }, status: "POSTED", deletedAt: null }, _sum: { unallocatedPaise: true } });
      for (const r of rc) advance.set(r.partyId, n(r._sum.unallocatedPaise));
      const cn = await this.prisma.creditNote.findMany({ where: { partyId: { in: ids }, status: "POSTED", deletedAt: null }, select: { partyId: true, totalPaise: true, adjustedPaise: true } });
      for (const c of cn) advance.set(c.partyId, (advance.get(c.partyId) ?? 0) + n(c.totalPaise) - n(c.adjustedPaise));
    } else {
      const pis = await this.prisma.purchaseInvoice.findMany({
        where: { supplierId: { in: ids }, status: "POSTED", deletedAt: null, ...(branchId ? { branchId } : {}) },
        select: { supplierId: true, date: true, totalPaise: true, paidPaise: true },
      });
      docs = pis.map((i) => ({ partyId: i.supplierId, date: i.date, due: n(i.totalPaise) - n(i.paidPaise) }));
      const pays = await this.prisma.payment.findMany({ where: { partyId: { in: ids }, status: "POSTED", deletedAt: null }, include: { allocations: { where: { deletedAt: null } } } });
      for (const p of pays) {
        const un = n(p.amountPaise) - p.allocations.reduce((a, x) => a + n(x.amountPaise), 0);
        if (un > 0) advance.set(p.partyId, (advance.get(p.partyId) ?? 0) + un);
      }
    }
    const snaps = await this.prisma.ledgerBalanceSnapshot.findMany({ where: { partyId: { in: ids } }, orderBy: { asOf: "desc" }, distinct: ["partyId"] });

    const rows: AccountsOutstandingRow[] = [];
    for (const p of parties) {
      const buckets = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 } as AccountsOutstandingRow["buckets"];
      let total = 0;
      let overdue = 0;
      const opening = n(p.openingBalancePaise);
      if (opening > 0) {
        buckets["90+"] += opening;
        total += opening;
      }
      for (const d of docs.filter((x) => x.partyId === p.id && x.due > 0)) {
        const days = daysBetween(d.date);
        buckets[ageingBucket(days)] += d.due;
        total += d.due;
        if (days > p.creditDays) overdue += d.due;
      }
      const adv = advance.get(p.id) ?? 0;
      if (total === 0 && adv === 0) continue;
      const snap = snaps.find((s) => s.partyId === p.id);
      rows.push({
        partyId: p.id,
        name: p.name,
        phone: p.phone,
        segment: p.segment,
        creditLimitPaise: n(p.creditLimitPaise),
        creditDays: p.creditDays,
        totalPaise: total - adv,
        overduePaise: overdue,
        buckets,
        advancePaise: adv,
        tallyClosingPaise: snap ? n(snap.closingPaise) : null,
        tallyAsOf: snap ? snap.asOf.toISOString() : null,
        whatsappUrl: type === "CUSTOMER" ? reminderUrl(p.phone, p.name, total - adv) : null,
      });
    }
    rows.sort((a, b) => b.totalPaise - a.totalPaise);
    const summary = {
      totalPaise: rows.reduce((a, r) => a + r.totalPaise, 0),
      overduePaise: rows.reduce((a, r) => a + r.overduePaise, 0),
      b0_30: rows.reduce((a, r) => a + r.buckets["0-30"], 0),
      b31_60: rows.reduce((a, r) => a + r.buckets["31-60"], 0),
      b61_90: rows.reduce((a, r) => a + r.buckets["61-90"], 0),
      b90: rows.reduce((a, r) => a + r.buckets["90+"], 0),
      parties: rows.length,
    };
    return { rows, summary };
  }

  // ------------------------------------------------------------------ party statement

  async statement(partyId: string, from?: Date, to?: Date) {
    const party = await this.prisma.party.findFirst({ where: { id: partyId, deletedAt: null } });
    if (!party) throw new NotFoundException("Party not found");
    type Row = { date: Date; type: string; number: string; id: string; debit: number; credit: number; link: string };
    const all: Row[] = [];
    const isSupplier = party.type === "SUPPLIER";
    const [invoices, receipts, credits, pis, pays, dns] = await Promise.all([
      this.prisma.invoice.findMany({ where: { partyId, status: { in: ["POSTED"] }, deletedAt: null } }),
      this.prisma.receipt.findMany({ where: { partyId, status: "POSTED", deletedAt: null } }),
      this.prisma.creditNote.findMany({ where: { partyId, status: "POSTED", deletedAt: null } }),
      this.prisma.purchaseInvoice.findMany({ where: { supplierId: partyId, status: "POSTED", deletedAt: null } }),
      this.prisma.payment.findMany({ where: { partyId, status: "POSTED", deletedAt: null } }),
      this.prisma.debitNote.findMany({ where: { supplierId: partyId, status: "POSTED", deletedAt: null } }),
    ]);
    // Customer view: debit = they owe us. Supplier view: credit = we owe them.
    for (const i of invoices) all.push({ date: i.date, type: "Invoice", number: i.number ?? "", id: i.id, debit: n(i.totalPaise), credit: 0, link: `/sales/invoices/${i.id}` });
    for (const r of receipts) all.push({ date: r.date, type: `Receipt (${r.mode})`, number: r.number, id: r.id, debit: 0, credit: n(r.amountPaise), link: `/accounts/receipts/${r.id}` });
    for (const c of credits) all.push({ date: c.date, type: "Credit note", number: c.number, id: c.id, debit: 0, credit: n(c.totalPaise), link: `/sales/returns` });
    for (const p of pis) all.push({ date: p.date, type: "Purchase invoice", number: p.supplierInvoiceNo, id: p.id, debit: 0, credit: n(p.totalPaise), link: `/purchase/invoices/${p.id}` });
    for (const p of pays) all.push({ date: p.date, type: `Payment (${p.mode})`, number: p.number, id: p.id, debit: n(p.amountPaise), credit: 0, link: `/accounts/payments/${p.id}` });
    for (const d of dns) all.push({ date: d.date, type: "Debit note", number: d.number, id: d.id, debit: n(d.totalPaise), credit: 0, link: `/purchase/debit-notes` });
    all.sort((a, b) => a.date.getTime() - b.date.getTime());

    const sign = isSupplier ? -1 : 1;
    let opening = sign * n(party.openingBalancePaise);
    const rows: (Row & { balance: number })[] = [];
    let bal = 0;
    for (const r of all) {
      if (from && r.date < from) {
        opening += r.debit - r.credit;
        continue;
      }
      if (to && r.date > to) continue;
      rows.push({ ...r, balance: 0 });
    }
    bal = opening;
    for (const r of rows) {
      bal += r.debit - r.credit;
      r.balance = bal;
    }
    return {
      party: { id: party.id, name: party.name, phone: party.phone, gstin: party.gstin, billingAddress: party.billingAddress, type: party.type },
      from: from ?? null,
      to: to ?? null,
      opening,
      rows,
      closing: bal,
      totals: { debit: rows.reduce((a, r) => a + r.debit, 0), credit: rows.reduce((a, r) => a + r.credit, 0) },
    };
  }

  // ------------------------------------------------------------------ influencer payouts

  async influencerPayout(input: { influencerId: string; amountPaise: number; points: number; note?: string | null }) {
    return this.prisma.tx(async (tx) => {
      const inf = await tx.influencer.findFirst({ where: { id: input.influencerId, deletedAt: null } });
      if (!inf) throw new NotFoundException("Influencer not found");
      if (input.points > inf.pointsBalance) throw new BadRequestException(`Only ${inf.pointsBalance} points available`);
      const row = await tx.influencerLedger.create({
        data: {
          influencerId: inf.id,
          kind: "PAYOUT",
          points: -input.points,
          amountPaise: BigInt(-input.amountPaise),
          note: input.note ?? null,
          ...stampCreate(),
        },
      });
      await tx.influencer.update({ where: { id: inf.id }, data: { pointsBalance: { decrement: input.points } } });
      await this.audit.log({ entity: "influencer_ledger", entityId: row.id, action: "payout", after: row }, tx);
      return row;
    });
  }

  currentBranch(): string {
    const b = ctx().branchId;
    if (!b) throw new BadRequestException("No branch selected");
    return b;
  }
}
