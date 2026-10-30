import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from "@nestjs/common";
import { salesDocTotals, type SalesOrderInput } from "@gc/shared";
import { z } from "zod";
import { salesSplitSchema } from "@gc/shared";
import { PrismaService, Tx } from "../../prisma/prisma.service";
import { AuditService } from "../../core/audit.service";
import { NumberingService } from "../../core/numbering.service";
import { SettingsService } from "../../core/settings.service";
import { LedgerService } from "../../core/ledger.service";
import { ApprovalService } from "../../core/approval.service";
import { CreditService } from "../../core/credit.service";
import { ctx, stampCreate, stampUpdate } from "../../common/context";
import { loadProducts, normaliseQty, pickBatch, productInclude, resolvePlace, spec } from "./sales.common";

export const orderInclude = {
  party: true,
  site: true,
  branch: { include: { company: true } },
  lines: {
    where: { deletedAt: null },
    orderBy: { sortOrder: "asc" as const },
    include: { product: { include: productInclude }, batch: true },
  },
};

type OrderLineIn = Omit<SalesOrderInput["lines"][number], "discountPct"> & { discountPct?: number };
type OrderIn = Omit<SalesOrderInput, "lines" | "confirm"> & { lines: OrderLineIn[]; confirm?: boolean };

/**
 * Sales orders. Confirming runs the discount (role limit) and credit checks; anything outside limits
 * goes to approval (PENDING_APPROVAL). A confirmed order (status APPROVED, shown as "Confirmed")
 * reserves each line from ONE batch via RESERVED ledger rows; invoices release the reservation.
 */
@Injectable()
export class OrderService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly settings: SettingsService,
    private readonly ledger: LedgerService,
    private readonly approvals: ApprovalService,
    private readonly credit: CreditService,
  ) {}

  onModuleInit() {
    this.approvals.registerHandler("sales_order", async (tx, request, approved) => {
      const order = await tx.salesOrder.findUnique({ where: { id: request.refId } });
      if (!order || order.status !== "PENDING_APPROVAL") return;
      if (!approved) {
        await tx.salesOrder.update({ where: { id: order.id }, data: { status: "CANCELLED", approvalStatus: "REJECTED", holdReason: request.decisionNote ?? "Rejected" } });
        await tx.approvalRequest.updateMany({ where: { refType: "sales_order", refId: order.id, status: "PENDING" }, data: { status: "REJECTED", decisionNote: "Order rejected" } });
        return;
      }
      const stillPending = await tx.approvalRequest.count({ where: { refType: "sales_order", refId: order.id, status: "PENDING", deletedAt: null } });
      if (stillPending > 0) return;
      await this.reserve(tx, order.id);
      await tx.salesOrder.update({ where: { id: order.id }, data: { status: "APPROVED", approvalStatus: "APPROVED", holdReason: null } });
    });
  }

  async get(id: string, branchId?: string) {
    const o = await this.prisma.salesOrder.findFirst({ where: { id, deletedAt: null, ...(branchId ? { branchId } : {}) }, include: orderInclude });
    if (!o) throw new NotFoundException("Sales order not found");
    const [approvals, invoices] = await Promise.all([
      this.prisma.approvalRequest.findMany({ where: { refType: "sales_order", refId: id, deletedAt: null }, orderBy: { createdAt: "desc" }, include: { decidedBy: { select: { name: true } } } }),
      this.prisma.invoice.findMany({ where: { salesOrderId: id, deletedAt: null }, select: { id: true, number: true, status: true, totalPaise: true, date: true } }),
    ]);
    return { ...o, approvals, invoices };
  }

  async create(branchId: string, input: SalesOrderInput) {
    return this.prisma.tx(async (tx) => {
      const order = await this.createInTx(tx, branchId, input);
      if (input.confirm) await this.confirmInTx(tx, order.id);
      return tx.salesOrder.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });
    });
  }

  async createInTx(tx: Tx, branchId: string, input: OrderIn) {
    const date = input.date ?? new Date();
    const number = await this.numbering.next(tx, branchId, "SALES_ORDER", date);
    const order = await tx.salesOrder.create({ data: { branchId, number, date, partyId: input.partyId, placeOfSupply: "33", ...stampCreate() } });
    await this.write(tx, branchId, order.id, input);
    const after = await tx.salesOrder.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });
    await this.audit.log({ entity: "sales_order", entityId: order.id, action: "create", after }, tx);
    return after;
  }

  async update(id: string, branchId: string, input: SalesOrderInput) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.salesOrder.findFirst({ where: { id, branchId, deletedAt: null }, include: orderInclude });
      if (!before) throw new NotFoundException("Sales order not found");
      if (before.status !== "DRAFT") throw new BadRequestException("Only draft orders can be edited");
      await this.write(tx, branchId, id, input);
      if (input.confirm) await this.confirmInTx(tx, id);
      const after = await tx.salesOrder.findUniqueOrThrow({ where: { id }, include: orderInclude });
      await this.audit.log({ entity: "sales_order", entityId: id, action: "update", before, after }, tx);
      return after;
    });
  }

  private async write(tx: Tx, branchId: string, id: string, input: OrderIn) {
    const place = await resolvePlace(tx, branchId, input.partyId, input.placeOfSupply);
    const products = await loadProducts(tx, input.lines.map((l) => l.productId));
    const chargesRate = Number((await this.settings.get("charges.gstRate")) ?? 18);
    const lines = input.lines.map((l) => {
      const p = products.get(l.productId)!;
      return { p, l: { ...l, qtyPcs: normaliseQty(p, l.qtyPcs), discountPct: l.discountPct ?? 0 } };
    });
    const totals = salesDocTotals(
      lines.map(({ p, l }) => ({ product: spec(p), line: l })),
      place.interState,
      input.transportPaise + input.loadingPaise,
      chargesRate,
    );
    await tx.salesOrderLine.deleteMany({ where: { orderId: id } });
    await tx.salesOrder.update({
      where: { id },
      data: {
        partyId: input.partyId,
        siteId: input.siteId ?? null,
        quotationId: input.quotationId ?? null,
        influencerId: input.influencerId ?? null,
        date: input.date ?? undefined,
        deliveryDate: input.deliveryDate ?? null,
        placeOfSupply: place.placeOfSupply,
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
      await tx.salesOrderLine.create({
        data: {
          orderId: id,
          productId: p.id,
          batchId: l.batchId ?? null,
          godownId: l.godownId ?? null,
          qtyPcs: l.qtyPcs,
          ratePaise: BigInt(totals.rates[i]),
          discountPct: l.discountPct,
          gstRate: p.gstRate,
          taxablePaise: BigInt(lt.taxablePaise),
          taxPaise: BigInt(lt.taxPaise),
          amountPaise: BigInt(lt.amountPaise),
          deliveryDate: input.deliveryDate ?? null,
          sortOrder: i,
          ...stampCreate(),
        },
      });
    }
  }

  async confirm(id: string, branchId: string) {
    return this.prisma.tx(async (tx) => {
      const o = await tx.salesOrder.findFirst({ where: { id, branchId, deletedAt: null } });
      if (!o) throw new NotFoundException("Sales order not found");
      await this.confirmInTx(tx, id);
      return tx.salesOrder.findUniqueOrThrow({ where: { id }, include: orderInclude });
    });
  }

  /** Discount + credit checks; approvals if needed, else reserve stock and confirm. */
  async confirmInTx(tx: Tx, id: string) {
    const order = await tx.salesOrder.findUniqueOrThrow({ where: { id }, include: { lines: { where: { deletedAt: null } }, party: true } });
    if (order.status !== "DRAFT") throw new BadRequestException(`Order is already ${order.status.toLowerCase().replace("_", " ")}`);
    const user = ctx().user;
    const limit = user?.discountLimitPct ?? 0;
    const maxDisc = Math.max(0, ...order.lines.map((l) => l.discountPct));
    const reasons: string[] = [];
    if (maxDisc > limit) {
      await this.approvals.request(tx, {
        type: "DISCOUNT",
        refType: "sales_order",
        refId: id,
        branchId: order.branchId,
        reason: `${order.number} (${order.party.name}): ${maxDisc}% discount is above your ${limit}% limit`,
        payload: { maxDiscountPct: maxDisc, limitPct: limit },
        link: `/sales/orders/${id}`,
      });
      reasons.push(`Discount ${maxDisc}% above ${limit}% limit`);
    }
    const credit = await this.credit.status(tx, order.partyId, Number(order.totalPaise));
    if (!credit.ok) {
      await this.approvals.request(tx, {
        type: "CREDIT",
        refType: "sales_order",
        refId: id,
        branchId: order.branchId,
        reason: `${order.number} (${order.party.name}): ${credit.reasons.join("; ")}`,
        payload: credit,
        link: `/sales/orders/${id}`,
      });
      reasons.push(...credit.reasons);
    }
    if (reasons.length) {
      // validate stock now so the approver doesn't approve something we can't reserve
      await this.reserve(tx, id, true);
      await tx.salesOrder.update({ where: { id }, data: { status: "PENDING_APPROVAL", approvalStatus: "PENDING", holdReason: reasons.join("; "), ...stampUpdate() } });
      await this.audit.log({ entity: "sales_order", entityId: id, action: "hold", after: { reasons } }, tx);
      return;
    }
    await this.reserve(tx, id);
    await tx.salesOrder.update({ where: { id }, data: { status: "APPROVED", ...stampUpdate() } });
    await this.audit.log({ entity: "sales_order", entityId: id, action: "confirm" }, tx);
  }

  /** Reserve every line from one batch (or only check availability with dryRun). */
  private async reserve(tx: Tx, id: string, dryRun = false) {
    const order = await tx.salesOrder.findUniqueOrThrow({ where: { id }, include: { lines: { where: { deletedAt: null }, include: { product: true } } } });
    for (const line of order.lines) {
      const qty = line.qtyPcs - line.invoicedPcs;
      if (qty <= 0) continue;
      const pick = await pickBatch(tx, this.ledger, line.product, qty, order.branchId, { batchId: line.batchId, godownId: line.godownId }, line.id);
      if (dryRun) continue;
      await tx.salesOrderLine.update({ where: { id: line.id }, data: { batchId: pick.batchId, godownId: pick.godownId } });
      await this.ledger.post(tx, [
        {
          branchId: order.branchId,
          productId: line.productId,
          batchId: pick.batchId,
          godownId: pick.godownId,
          qtyPcs: qty,
          stockType: "RESERVED",
          refType: "SALES_ORDER",
          refId: order.id,
          refLineId: line.id,
          ratePaise: line.ratePaise,
          note: `Reserved for ${order.number}`,
        },
      ]);
    }
  }

  /** Release what is still reserved (qty − invoiced) for the given lines. */
  async release(tx: Tx, orderId: string, refType = "SALES_ORDER_RELEASE") {
    const order = await tx.salesOrder.findUniqueOrThrow({ where: { id: orderId }, include: { lines: { where: { deletedAt: null } } } });
    if (!["APPROVED", "PARTIAL"].includes(order.status)) return;
    for (const line of order.lines) {
      const qty = line.qtyPcs - line.invoicedPcs;
      if (qty <= 0 || !line.batchId || !line.godownId) continue;
      await this.ledger.post(tx, [
        { branchId: order.branchId, productId: line.productId, batchId: line.batchId, godownId: line.godownId, qtyPcs: -qty, stockType: "RESERVED", refType, refId: order.id, refLineId: line.id },
      ]);
    }
  }

  /** Split a line across batches (shortage in one shade). Re-reserves when the order is confirmed. */
  async split(id: string, lineId: string, branchId: string, body: z.infer<typeof salesSplitSchema>) {
    return this.prisma.tx(async (tx) => {
      const order = await tx.salesOrder.findFirst({ where: { id, branchId, deletedAt: null }, include: { lines: { where: { deletedAt: null } } } });
      if (!order) throw new NotFoundException("Sales order not found");
      if (!["DRAFT", "APPROVED", "PENDING_APPROVAL"].includes(order.status)) throw new BadRequestException("This order can no longer be changed");
      const line = order.lines.find((l) => l.id === lineId);
      if (!line) throw new NotFoundException("Line not found");
      if (line.invoicedPcs > 0) throw new BadRequestException("Part of this line is already invoiced");
      const total = body.parts.reduce((a, p) => a + p.qtyPcs, 0);
      if (total !== line.qtyPcs) throw new BadRequestException(`Split quantities must add up to ${line.qtyPcs} pcs`);
      const confirmed = order.status === "APPROVED";
      if (confirmed && line.batchId && line.godownId) {
        await this.ledger.post(tx, [
          { branchId: order.branchId, productId: line.productId, batchId: line.batchId, godownId: line.godownId, qtyPcs: -line.qtyPcs, stockType: "RESERVED", refType: "SALES_ORDER_SPLIT", refId: order.id, refLineId: line.id },
        ]);
      }
      const product = await tx.product.findUniqueOrThrow({ where: { id: line.productId } });
      const unitTax = (n: number) => ({
        taxablePaise: BigInt(Math.round((Number(line.taxablePaise) * n) / line.qtyPcs)),
        taxPaise: BigInt(Math.round((Number(line.taxPaise) * n) / line.qtyPcs)),
        amountPaise: BigInt(Math.round((Number(line.amountPaise) * n) / line.qtyPcs)),
      });
      await tx.salesOrderLine.update({ where: { id: line.id }, data: { deletedAt: new Date(), ...stampUpdate() } });
      for (const part of body.parts) {
        const pick = confirmed ? await pickBatch(tx, this.ledger, product, part.qtyPcs, order.branchId, { batchId: part.batchId, godownId: part.godownId }) : { batchId: part.batchId, godownId: part.godownId ?? null };
        const created = await tx.salesOrderLine.create({
          data: {
            orderId: order.id,
            productId: line.productId,
            batchId: pick.batchId,
            godownId: pick.godownId,
            qtyPcs: part.qtyPcs,
            ratePaise: line.ratePaise,
            discountPct: line.discountPct,
            gstRate: line.gstRate,
            ...unitTax(part.qtyPcs),
            deliveryDate: line.deliveryDate,
            sortOrder: line.sortOrder,
            ...stampCreate(),
          },
        });
        if (confirmed) {
          await this.ledger.post(tx, [
            { branchId: order.branchId, productId: line.productId, batchId: pick.batchId, godownId: pick.godownId!, qtyPcs: part.qtyPcs, stockType: "RESERVED", refType: "SALES_ORDER", refId: order.id, refLineId: created.id },
          ]);
        }
      }
      await this.audit.log({ entity: "sales_order", entityId: id, action: "split_line", before: line, after: body }, tx);
      return tx.salesOrder.findUniqueOrThrow({ where: { id }, include: orderInclude });
    });
  }

  async cancel(id: string, branchId: string, reason: string) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.salesOrder.findFirst({ where: { id, branchId, deletedAt: null } });
      if (!before) throw new NotFoundException("Sales order not found");
      if (["COMPLETED", "CANCELLED"].includes(before.status)) throw new BadRequestException(`Order is already ${before.status.toLowerCase()}`);
      await this.release(tx, id);
      await tx.approvalRequest.updateMany({ where: { refType: "sales_order", refId: id, status: "PENDING" }, data: { status: "REJECTED", decisionNote: "Order cancelled" } });
      const after = await tx.salesOrder.update({ where: { id }, data: { status: "CANCELLED", holdReason: reason, ...stampUpdate() } });
      await this.audit.log({ entity: "sales_order", entityId: id, action: "cancel", before, after }, tx);
      return after;
    });
  }

  /** Recompute status after invoicing: COMPLETED when every line is fully invoiced, else PARTIAL. */
  async refreshStatus(tx: Tx, orderId: string) {
    const o = await tx.salesOrder.findUniqueOrThrow({ where: { id: orderId }, include: { lines: { where: { deletedAt: null } } } });
    if (o.status === "CANCELLED") return;
    const invoiced = o.lines.reduce((a, l) => a + l.invoicedPcs, 0);
    const status = o.lines.every((l) => l.invoicedPcs >= l.qtyPcs) ? "COMPLETED" : invoiced > 0 ? "PARTIAL" : "APPROVED";
    if (status !== o.status) await tx.salesOrder.update({ where: { id: orderId }, data: { status } });
  }
}
