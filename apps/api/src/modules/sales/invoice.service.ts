import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { salesDocTotals, type SalesInvoiceInput } from "@gc/shared";
import { PrismaService, Tx } from "../../prisma/prisma.service";
import { AuditService } from "../../core/audit.service";
import { NumberingService } from "../../core/numbering.service";
import { SettingsService } from "../../core/settings.service";
import { LedgerService } from "../../core/ledger.service";
import { TallyQueueService } from "../../core/tally-queue.service";
import { ctx, stampCreate, stampUpdate } from "../../common/context";
import { addDays, loadProducts, normaliseQty, pickBatch, productInclude, resolvePlace, spec } from "./sales.common";
import { OrderService } from "./order.service";

export const invoiceInclude = {
  party: true,
  site: true,
  influencer: { select: { id: true, name: true, type: true } },
  salesOrder: { select: { id: true, number: true } },
  branch: { include: { company: true } },
  lines: {
    where: { deletedAt: null },
    orderBy: { sortOrder: "asc" as const },
    include: { product: { include: productInclude }, batch: true },
  },
};

type InvoiceIn = Omit<SalesInvoiceInput, "post"> & { post?: boolean };

/**
 * Invoices. Drafts can be edited; posting assigns the number (series per branch + FY), moves stock
 * out through the ledger (releasing order reservations), sets the due date and queues the Tally
 * voucher. Posted invoices are never edited: they are cancelled (stock back, number kept) and re-issued.
 */
@Injectable()
export class InvoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly settings: SettingsService,
    private readonly ledger: LedgerService,
    private readonly tally: TallyQueueService,
    private readonly orders: OrderService,
  ) {}

  async get(id: string, branchId?: string) {
    const inv = await this.prisma.invoice.findFirst({ where: { id, deletedAt: null, ...(branchId ? { branchId } : {}) }, include: invoiceInclude });
    if (!inv) throw new NotFoundException("Invoice not found");
    const [warnings, challans, returns, allocations] = await Promise.all([
      this.shadeWarnings(this.prisma, inv.id),
      this.prisma.deliveryChallan.findMany({ where: { invoiceId: id, deletedAt: null }, select: { id: true, number: true, date: true, status: true } }),
      this.prisma.salesReturn.findMany({ where: { invoiceId: id, deletedAt: null }, select: { id: true, number: true, date: true, totalPaise: true } }),
      this.prisma.receiptAllocation.findMany({ where: { invoiceId: id, deletedAt: null }, include: { receipt: { select: { id: true, number: true, date: true, mode: true } } } }),
    ]);
    return { ...inv, warnings, challans, returns, allocations };
  }

  async create(branchId: string, input: InvoiceIn) {
    return this.prisma.tx(async (tx) => {
      const inv = await this.createInTx(tx, branchId, input);
      if (input.post) await this.postInTx(tx, inv.id);
      return tx.invoice.findUniqueOrThrow({ where: { id: inv.id }, include: invoiceInclude });
    });
  }

  async createInTx(tx: Tx, branchId: string, input: InvoiceIn) {
    const inv = await tx.invoice.create({
      data: { branchId, date: input.date ?? new Date(), partyId: input.partyId, placeOfSupply: "33", ...stampCreate() },
    });
    await this.write(tx, branchId, inv.id, input);
    const after = await tx.invoice.findUniqueOrThrow({ where: { id: inv.id }, include: invoiceInclude });
    await this.audit.log({ entity: "invoice", entityId: inv.id, action: "create", after }, tx);
    return after;
  }

  async update(id: string, branchId: string, input: InvoiceIn) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.invoice.findFirst({ where: { id, branchId, deletedAt: null }, include: invoiceInclude });
      if (!before) throw new NotFoundException("Invoice not found");
      if (before.status !== "DRAFT") throw new BadRequestException("Posted invoices can't be edited. Cancel and re-issue instead.");
      await this.write(tx, branchId, id, input);
      if (input.post) await this.postInTx(tx, id);
      const after = await tx.invoice.findUniqueOrThrow({ where: { id }, include: invoiceInclude });
      await this.audit.log({ entity: "invoice", entityId: id, action: "update", before, after }, tx);
      return after;
    });
  }

  private async write(tx: Tx, branchId: string, id: string, input: InvoiceIn) {
    const place = await resolvePlace(tx, branchId, input.partyId, input.placeOfSupply);
    const products = await loadProducts(tx, input.lines.map((l) => l.productId));
    const chargesRate = Number((await this.settings.get("charges.gstRate")) ?? 18);
    const lines = input.lines.map((l) => {
      const p = products.get(l.productId)!;
      return { p, l: { ...l, qtyPcs: l.orderLineId ? l.qtyPcs : normaliseQty(p, l.qtyPcs), discountPct: l.discountPct ?? 0 } };
    });
    const totals = salesDocTotals(
      lines.map(({ p, l }) => ({ product: spec(p), line: l })),
      place.interState,
      input.transportPaise + input.loadingPaise,
      chargesRate,
    );
    await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
    await tx.invoice.update({
      where: { id },
      data: {
        partyId: input.partyId,
        siteId: input.siteId ?? null,
        influencerId: input.influencerId ?? null,
        salesOrderId: input.salesOrderId ?? null,
        date: input.date ?? undefined,
        placeOfSupply: place.placeOfSupply,
        isInterState: place.interState,
        notes: input.notes ?? null,
        transportPaise: BigInt(input.transportPaise),
        loadingPaise: BigInt(input.loadingPaise),
        subtotalPaise: BigInt(totals.subtotalPaise),
        discountPaise: BigInt(totals.discountPaise),
        taxablePaise: BigInt(totals.taxablePaise),
        cgstPaise: BigInt(totals.cgstPaise),
        sgstPaise: BigInt(totals.sgstPaise),
        igstPaise: BigInt(totals.igstPaise),
        roundOffPaise: BigInt(totals.roundOffPaise),
        totalPaise: BigInt(totals.totalPaise),
        ...stampUpdate(),
      },
    });
    for (const [i, { p, l }] of lines.entries()) {
      const lt = totals.lines[i];
      await tx.invoiceLine.create({
        data: {
          invoiceId: id,
          productId: p.id,
          batchId: l.batchId ?? null,
          godownId: l.godownId ?? null,
          orderLineId: l.orderLineId ?? null,
          hsn: p.hsn,
          qtyPcs: l.qtyPcs,
          ratePaise: BigInt(totals.rates[i]),
          discountPct: l.discountPct,
          gstRate: p.gstRate,
          taxablePaise: BigInt(lt.taxablePaise),
          cgstPaise: BigInt(lt.cgstPaise),
          sgstPaise: BigInt(lt.sgstPaise),
          igstPaise: BigInt(lt.igstPaise),
          amountPaise: BigInt(lt.amountPaise),
          sortOrder: i,
          ...stampCreate(),
        },
      });
    }
  }

  /** Invoice the remaining quantity of a confirmed order (draft; batches come from the reservation). */
  async fromOrder(orderId: string, branchId: string) {
    return this.prisma.tx(async (tx) => {
      const o = await tx.salesOrder.findFirst({ where: { id: orderId, branchId, deletedAt: null }, include: { lines: { where: { deletedAt: null } } } });
      if (!o) throw new NotFoundException("Sales order not found");
      if (!["APPROVED", "PARTIAL"].includes(o.status)) throw new BadRequestException("Confirm the order before invoicing");
      const open = o.lines.filter((l) => l.qtyPcs > l.invoicedPcs);
      if (!open.length) throw new BadRequestException("Everything on this order is already invoiced");
      const drafts = await tx.invoice.count({ where: { salesOrderId: orderId, status: "DRAFT", deletedAt: null } });
      if (drafts) throw new BadRequestException("A draft invoice for this order already exists");
      const inv = await this.createInTx(tx, branchId, {
        partyId: o.partyId,
        siteId: o.siteId,
        influencerId: o.influencerId,
        salesOrderId: o.id,
        placeOfSupply: o.placeOfSupply,
        notes: o.notes,
        transportPaise: Number(o.transportPaise),
        loadingPaise: Number(o.loadingPaise),
        lines: open.map((l) => ({
          productId: l.productId,
          batchId: l.batchId,
          godownId: l.godownId,
          orderLineId: l.id,
          qtyPcs: l.qtyPcs - l.invoicedPcs,
          priceBasis: "PER_UNIT" as const,
          enteredRatePaise: Number(l.ratePaise),
          discountPct: l.discountPct,
        })),
      });
      return inv;
    });
  }

  async post(id: string, branchId: string) {
    return this.prisma.tx(async (tx) => {
      const inv = await tx.invoice.findFirst({ where: { id, branchId, deletedAt: null } });
      if (!inv) throw new NotFoundException("Invoice not found");
      await this.postInTx(tx, id);
      return tx.invoice.findUniqueOrThrow({ where: { id }, include: invoiceInclude });
    });
  }

  async postInTx(tx: Tx, id: string) {
    const inv = await tx.invoice.findUniqueOrThrow({ where: { id }, include: { lines: { where: { deletedAt: null }, include: { product: true } }, party: true } });
    if (inv.status !== "DRAFT") throw new BadRequestException(`Invoice is already ${inv.status.toLowerCase()}`);
    if (!inv.lines.length) throw new BadRequestException("Invoice has no lines");
    if (Number(inv.totalPaise) <= 0) throw new BadRequestException("Invoice total must be more than zero");
    // Discounts above the role limit need approval. Order lines were approved on the order;
    // direct billing lines can't carry them.
    const limit = ctx().user?.discountLimitPct ?? 0;
    const overLimit = inv.lines.filter((l) => !l.orderLineId && (l.discountPct ?? 0) > limit);
    if (overLimit.length) {
      throw new BadRequestException(
        `Discount above your limit of ${limit}% on ${overLimit.map((l) => l.product.sku).join(", ")}. Reduce it, or raise a sales order so a manager can approve the discount.`,
      );
    }
    const number = await this.numbering.next(tx, inv.branchId, "INVOICE", inv.date);
    const orderIds = new Set<string>();
    for (const line of inv.lines) {
      const orderLine = line.orderLineId ? await tx.salesOrderLine.findUnique({ where: { id: line.orderLineId } }) : null;
      let batchId = line.batchId;
      let godownId = line.godownId;
      if (orderLine?.batchId && orderLine.godownId) {
        if (line.qtyPcs > orderLine.qtyPcs - orderLine.invoicedPcs) throw new BadRequestException(`More than ordered for ${line.product.sku}`);
        batchId = orderLine.batchId;
        godownId = orderLine.godownId;
        // release the reservation, then take the stock out
        await this.ledger.post(tx, [
          { branchId: inv.branchId, productId: line.productId, batchId, godownId, qtyPcs: -line.qtyPcs, stockType: "RESERVED", refType: "INVOICE", refId: inv.id, refLineId: line.id },
        ]);
        await tx.salesOrderLine.update({ where: { id: orderLine.id }, data: { invoicedPcs: { increment: line.qtyPcs } } });
        orderIds.add(orderLine.orderId);
      } else {
        const pick = await pickBatch(tx, this.ledger, line.product, line.qtyPcs, inv.branchId, { batchId, godownId }, line.id);
        batchId = pick.batchId;
        godownId = pick.godownId;
      }
      await this.ledger.post(tx, [
        {
          branchId: inv.branchId,
          productId: line.productId,
          batchId: batchId!,
          godownId: godownId!,
          qtyPcs: -line.qtyPcs,
          stockType: "SALEABLE",
          refType: "INVOICE",
          refId: inv.id,
          refLineId: line.id,
          ratePaise: line.ratePaise,
          note: number,
          postedAt: inv.date,
        },
      ]);
      await tx.invoiceLine.update({ where: { id: line.id }, data: { batchId, godownId } });
    }
    const updated = await tx.invoice.update({
      where: { id },
      data: {
        number,
        status: "POSTED",
        postedAt: new Date(),
        dueDate: addDays(inv.date, inv.party.creditDays),
        syncStatus: "PENDING",
        ...stampUpdate(),
      },
    });
    for (const oid of orderIds) await this.orders.refreshStatus(tx, oid);
    await this.tally.enqueueVoucher(tx, {
      entityType: "INVOICE",
      entityId: id,
      branchId: inv.branchId,
      partyId: inv.partyId,
      productIds: inv.lines.map((l) => l.productId),
    });
    await this.audit.log({ entity: "invoice", entityId: id, action: "post", before: { status: "DRAFT" }, after: updated }, tx);
    return updated;
  }

  /** Cancel a posted invoice: stock back (and order re-reserved), number kept, Tally cancellation queued. */
  async cancel(id: string, branchId: string, reason: string) {
    return this.prisma.tx(async (tx) => {
      const inv = await tx.invoice.findFirst({ where: { id, branchId, deletedAt: null }, include: { lines: { where: { deletedAt: null } } } });
      if (!inv) throw new NotFoundException("Invoice not found");
      if (inv.status === "DRAFT") {
        const after = await tx.invoice.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason, ...stampUpdate() } });
        await this.audit.log({ entity: "invoice", entityId: id, action: "cancel", before: inv, after }, tx);
        return after;
      }
      if (inv.status !== "POSTED") throw new BadRequestException(`Invoice is already ${inv.status.toLowerCase()}`);
      if (inv.paidPaise > 0n) throw new ConflictException("Receipts are allocated to this invoice. Reverse the allocation first.");
      const returns = await tx.salesReturn.count({ where: { invoiceId: id, deletedAt: null, status: "POSTED" } });
      if (returns) throw new ConflictException("This invoice has sales returns; it can't be cancelled.");
      const orderIds = new Set<string>();
      for (const line of inv.lines) {
        if (!line.batchId || !line.godownId) continue;
        await this.ledger.post(tx, [
          { branchId: inv.branchId, productId: line.productId, batchId: line.batchId, godownId: line.godownId, qtyPcs: line.qtyPcs, stockType: "SALEABLE", refType: "INVOICE_CANCEL", refId: inv.id, refLineId: line.id, ratePaise: line.ratePaise, note: inv.number },
        ]);
        if (line.orderLineId) {
          const ol = await tx.salesOrderLine.update({ where: { id: line.orderLineId }, data: { invoicedPcs: { decrement: line.qtyPcs } } });
          const order = await tx.salesOrder.findUniqueOrThrow({ where: { id: ol.orderId } });
          if (order.status !== "CANCELLED") {
            await this.ledger.post(tx, [
              { branchId: inv.branchId, productId: line.productId, batchId: line.batchId, godownId: line.godownId, qtyPcs: line.qtyPcs, stockType: "RESERVED", refType: "INVOICE_CANCEL", refId: inv.id, refLineId: line.id },
            ]);
            orderIds.add(ol.orderId);
          }
        }
      }
      const after = await tx.invoice.update({
        where: { id },
        data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason, ...stampUpdate() },
      });
      for (const oid of orderIds) await this.orders.refreshStatus(tx, oid);
      await this.tally.enqueue(tx, { entityType: "INVOICE_CANCEL", entityId: id, branchId: inv.branchId });
      await this.audit.log({ entity: "invoice", entityId: id, action: "cancel", before: inv, after }, tx);
      return after;
    });
  }

  /** Warn when a site already received a different shade of the same product. */
  async shadeWarnings(db: Tx | PrismaService, invoiceId: string) {
    const inv = await db.invoice.findUnique({ where: { id: invoiceId }, include: { lines: { where: { deletedAt: null }, include: { batch: true, product: true } } } });
    if (!inv?.siteId) return [];
    const out: { productId: string; sku: string; shade: string; earlierShades: string[]; message: string }[] = [];
    for (const l of inv.lines) {
      if (!l.batch || l.product.uomType !== "PIECE_BOX_AREA") continue;
      const earlier = await this.shadeCheck(db, inv.siteId, l.productId, l.batch.shadeCode, invoiceId);
      if (earlier.length) {
        out.push({
          productId: l.productId,
          sku: l.product.sku,
          shade: l.batch.shadeCode,
          earlierShades: earlier,
          message: `${l.product.sku}: this site earlier received shade ${earlier.join(", ")}; this invoice has shade ${l.batch.shadeCode}`,
        });
      }
    }
    return out;
  }

  async shadeCheck(db: Tx | PrismaService, siteId: string, productId: string, shadeCode: string, excludeInvoiceId?: string) {
    const prev = await db.invoiceLine.findMany({
      where: {
        productId,
        deletedAt: null,
        batchId: { not: null },
        invoice: { siteId, status: "POSTED", deletedAt: null, ...(excludeInvoiceId ? { id: { not: excludeInvoiceId } } : {}) },
      },
      include: { batch: { select: { shadeCode: true } } },
    });
    return [...new Set(prev.map((p) => p.batch!.shadeCode))].filter((s) => s !== shadeCode);
  }
}
