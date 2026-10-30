import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from "@nestjs/common";
import { ApprovalRequest, Prisma, StockType } from "@prisma/client";
import {
  ageingBucket,
  daysBetween,
  formatArea,
  InventoryAdjustmentInput,
  InventoryBreakageInput,
  InventoryTransferInput,
  InventoryTransferReceiveInput,
  ListQuery,
  weightKg,
} from "@gc/shared";
import { PrismaService, Tx } from "../../prisma/prisma.service";
import { LedgerService } from "../../core/ledger.service";
import { NumberingService } from "../../core/numbering.service";
import { ApprovalService } from "../../core/approval.service";
import { AuditService } from "../../core/audit.service";
import { SettingsService } from "../../core/settings.service";
import { ctx, stampCreate, stampUpdate } from "../../common/context";
import { paginate, searchWhere } from "../../common/pagination";
import {
  addToTotals,
  canSeeCost,
  drawFromGodown,
  emptyTotals,
  godownInBranch,
  productUnitSelect,
  QtyTotals,
  qtyText,
  rackInGodown,
  reverseLedger,
  stripBatchCost,
} from "./stock-helpers";

type SummaryQuery = ListQuery & { brandId?: string; categoryId?: string; godownId?: string; inStock?: string };

@Injectable()
export class InventoryService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly numbering: NumberingService,
    private readonly approvals: ApprovalService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  onModuleInit() {
    this.approvals.registerHandler("stock_adjustment", (tx, req, approved) => this.applyAdjustmentDecision(tx, req, approved));
    this.approvals.registerHandler("breakage_entry", (tx, req, approved) => this.applyWriteOffDecision(tx, req, approved));
  }

  // ------------------------------------------------------------------ stock views

  /** Per-product totals for the current branch: saleable, reserved, available, display, damaged. */
  async summary(branchId: string, q: SummaryQuery) {
    const balanceWhere: Prisma.StockBalanceWhereInput = { branchId, ...(q.godownId ? { godownId: q.godownId } : {}) };
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...searchWhere(q.q, ["name", "sku", "brand.name", "size.name"]),
      ...(q.brandId ? { brandId: q.brandId } : {}),
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
    };
    if (q.inStock === "true") {
      const ids = await this.prisma.stockBalance.groupBy({ by: ["productId"], where: { ...balanceWhere, qtyPcs: { not: 0 } } });
      where.id = { in: ids.map((r) => r.productId) };
    }
    const page = await paginate<any>(this.prisma.product, q, {
      where,
      select: productUnitSelect,
      orderBy: { name: "asc" },
      allowedSort: ["name", "sku"],
    });
    const rows = await this.prisma.stockBalance.groupBy({
      by: ["productId", "stockType"],
      where: { ...balanceWhere, productId: { in: page.items.map((p) => p.id) } },
      _sum: { qtyPcs: true },
    });
    page.items = page.items.map((p) => {
      const t = emptyTotals();
      for (const r of rows.filter((x) => x.productId === p.id)) addToTotals(t, r.stockType, r._sum.qtyPcs ?? 0);
      return { ...p, ...t, availableText: qtyText(t.available, p), belowReorder: p.reorderLevelPcs > 0 && t.available < p.reorderLevelPcs };
    });
    return page;
  }

  /** Product → batch/shade → godown/rack drill-down. */
  async productDetail(branchId: string, productId: string) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, deletedAt: null }, select: { ...productUnitSelect, hsn: true, mrpPaise: true } });
    if (!product) throw new NotFoundException("Product not found");
    const balances = await this.prisma.stockBalance.findMany({
      where: { productId, branchId, qtyPcs: { not: 0 } },
      include: { batch: true, godown: { select: { id: true, name: true, code: true } }, rack: { select: { id: true, code: true } } },
      orderBy: [{ batch: { shadeCode: "asc" } }],
    });
    const total = emptyTotals();
    const batches = new Map<string, { batch: any; totals: QtyTotals; locations: any[] }>();
    for (const b of balances) {
      addToTotals(total, b.stockType, b.qtyPcs);
      const cur = batches.get(b.batchId) ?? { batch: stripBatchCost(b.batch), totals: emptyTotals(), locations: [] };
      addToTotals(cur.totals, b.stockType, b.qtyPcs);
      cur.locations.push({ godown: b.godown, rack: b.rack, stockType: b.stockType, qtyPcs: b.qtyPcs, text: qtyText(b.qtyPcs, product), areaText: product.uomType === "PIECE_BOX_AREA" ? formatArea(b.qtyPcs, product) : null });
      batches.set(b.batchId, cur);
    }
    return {
      product,
      totals: { ...total, availableText: qtyText(total.available, product), availableArea: product.uomType === "PIECE_BOX_AREA" ? formatArea(total.available, product) : null },
      batches: [...batches.values()].map((b) => ({ ...b, availableText: qtyText(b.totals.available, product), availableArea: product.uomType === "PIECE_BOX_AREA" ? formatArea(b.totals.available, product) : null })),
    };
  }

  async availability(branchId: string, productId: string) {
    const rows = await this.ledger.batchAvailability(this.prisma, productId, branchId);
    return rows.map((r) => ({ ...r, batch: stripBatchCost(r.batch) }));
  }

  async batches(q: ListQuery & { productId?: string }) {
    const page = await paginate<any>(this.prisma.batch, q, {
      where: { deletedAt: null, ...(q.productId ? { productId: q.productId } : {}), ...searchWhere(q.q, ["batchNo", "shadeCode", "product.name", "product.sku"]) },
      include: { product: { select: { id: true, sku: true, name: true, uomType: true } } },
      orderBy: { createdAt: "desc" },
    });
    page.items = page.items.map((b) => stripBatchCost(b));
    return page;
  }

  async ledgerList(branchId: string, q: ListQuery & { productId?: string; batchId?: string; godownId?: string; refType?: string; from?: string; to?: string }) {
    const where: Prisma.StockLedgerWhereInput = {
      branchId,
      ...(q.productId ? { productId: q.productId } : {}),
      ...(q.batchId ? { batchId: q.batchId } : {}),
      ...(q.godownId ? { godownId: q.godownId } : {}),
      ...(q.refType ? { refType: q.refType } : {}),
      ...(q.from || q.to ? { postedAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(`${q.to}T23:59:59.999+05:30`) } : {}) } } : {}),
      ...(q.q ? { OR: [{ product: { name: { contains: q.q, mode: "insensitive" } } }, { product: { sku: { contains: q.q, mode: "insensitive" } } }, { batch: { shadeCode: { contains: q.q, mode: "insensitive" } } }] } : {}),
    };
    const page = await paginate<any>(this.prisma.stockLedger, q, {
      where,
      include: {
        product: { select: { id: true, sku: true, name: true, uomType: true, unitName: true, pcsPerBox: true, sqftPerBox: true } },
        batch: { select: { id: true, batchNo: true, shadeCode: true, caliber: true, grade: true } },
        godown: { select: { id: true, name: true } },
        rack: { select: { id: true, code: true } },
      },
      orderBy: { postedAt: "desc" },
    });
    const cost = canSeeCost();
    page.items = page.items.map((r) => ({ ...r, ratePaise: cost ? r.ratePaise : undefined, text: qtyText(r.qtyPcs, r.product) }));
    return page;
  }

  // ------------------------------------------------------------------ transfers

  async createTransfer(branchId: string, input: InventoryTransferInput) {
    if (input.fromGodownId === input.toGodownId && input.lines.every((l) => (l.fromRackId ?? null) === (l.toRackId ?? null) && l.fromStockType === l.toStockType)) {
      throw new BadRequestException("Source and destination are the same");
    }
    const toGodown = await this.prisma.godown.findFirst({ where: { id: input.toGodownId, deletedAt: null } });
    if (!toGodown) throw new NotFoundException("Destination godown not found");
    if (toGodown.branchId !== branchId) return this.createInterBranchTransfer(branchId, toGodown.branchId, input);
    return this.prisma.tx(async (tx) => {
      await godownInBranch(tx, input.fromGodownId, branchId);
      await godownInBranch(tx, input.toGodownId, branchId);
      const date = input.date ?? new Date();
      const number = await this.numbering.next(tx, branchId, "TRANSFER", date);
      const doc = await tx.stockTransfer.create({
        data: {
          branchId,
          number,
          date,
          fromGodownId: input.fromGodownId,
          toGodownId: input.toGodownId,
          notes: input.notes ?? null,
          status: "POSTED",
          ...stampCreate(),
          lines: { create: input.lines.map((l) => ({ ...l, fromRackId: l.fromRackId ?? null, toRackId: l.toRackId ?? null, ...stampCreate() })) },
        },
        include: { lines: true },
      });
      for (const l of doc.lines) {
        await rackInGodown(tx, l.fromRackId, input.fromGodownId);
        await rackInGodown(tx, l.toRackId, input.toGodownId);
        const base = { branchId, productId: l.productId, batchId: l.batchId, refType: "TRANSFER", refId: doc.id, refLineId: l.id, postedAt: date };
        const outs = l.fromRackId
          ? [{ ...base, godownId: input.fromGodownId, rackId: l.fromRackId, stockType: l.fromStockType, qtyPcs: -l.qtyPcs }]
          : await drawFromGodown(tx, { ...base, godownId: input.fromGodownId, stockType: l.fromStockType, qtyPcs: l.qtyPcs });
        await this.ledger.post(tx, [...outs, { ...base, godownId: input.toGodownId, rackId: l.toRackId, stockType: l.toStockType, qtyPcs: l.qtyPcs }]);
      }
      await this.audit.log({ entity: "stock_transfer", entityId: doc.id, action: "post", after: doc }, tx);
      return doc;
    });
  }

  /**
   * Inter-branch transfer: stock leaves the source godown now and sits IN_TRANSIT at the destination
   * godown (destination branch) until someone there receives it.
   */
  private async createInterBranchTransfer(branchId: string, toBranchId: string, input: InventoryTransferInput) {
    for (const l of input.lines) {
      if (l.fromStockType !== "SALEABLE" || l.toStockType !== "SALEABLE") throw new BadRequestException("Inter-branch transfers move saleable stock only");
    }
    return this.prisma.tx(async (tx) => {
      await godownInBranch(tx, input.fromGodownId, branchId);
      const date = input.date ?? new Date();
      const number = await this.numbering.next(tx, branchId, "TRANSFER", date);
      const doc = await tx.stockTransfer.create({
        data: {
          branchId,
          number,
          date,
          fromGodownId: input.fromGodownId,
          toGodownId: input.toGodownId,
          toBranchId,
          transitState: "IN_TRANSIT",
          vehicleNo: input.vehicleNo ?? null,
          driverName: input.driverName ?? null,
          notes: input.notes ?? null,
          status: "POSTED",
          ...stampCreate(),
          lines: {
            create: input.lines.map((l) => ({
              productId: l.productId,
              batchId: l.batchId,
              fromRackId: l.fromRackId ?? null,
              toRackId: l.toRackId ?? null,
              fromStockType: "SALEABLE" as StockType,
              toStockType: "SALEABLE" as StockType,
              qtyPcs: l.qtyPcs,
              ...stampCreate(),
            })),
          },
        },
        include: { lines: true },
      });
      for (const l of doc.lines) {
        await rackInGodown(tx, l.fromRackId, input.fromGodownId);
        await rackInGodown(tx, l.toRackId, input.toGodownId);
        const base = { productId: l.productId, batchId: l.batchId, refType: "TRANSFER", refId: doc.id, refLineId: l.id, postedAt: date, note: number };
        const outs = l.fromRackId
          ? [{ ...base, branchId, godownId: input.fromGodownId, rackId: l.fromRackId, stockType: "SALEABLE" as StockType, qtyPcs: -l.qtyPcs }]
          : await drawFromGodown(tx, { ...base, branchId, godownId: input.fromGodownId, stockType: "SALEABLE", qtyPcs: l.qtyPcs });
        await this.ledger.post(tx, [...outs, { ...base, branchId: toBranchId, godownId: input.toGodownId, rackId: null, stockType: "IN_TRANSIT", qtyPcs: l.qtyPcs }]);
      }
      await this.audit.log({ entity: "stock_transfer", entityId: doc.id, action: "dispatch", after: doc }, tx);
      return doc;
    });
  }

  /**
   * Receive an inter-branch transfer at the destination: IN_TRANSIT out, SALEABLE in for what
   * arrived good, DAMAGED for broken pieces; broken and missing pieces get a TRANSIT breakage entry.
   */
  async receiveTransfer(branchId: string, id: string, input: InventoryTransferReceiveInput) {
    const user = ctx().user;
    return this.prisma.tx(async (tx) => {
      const doc = await tx.stockTransfer.findFirst({ where: { id, deletedAt: null }, include: { lines: { where: { deletedAt: null }, include: { product: true } } } });
      if (!doc) throw new NotFoundException("Transfer not found");
      if (!doc.toBranchId || doc.transitState !== "IN_TRANSIT") throw new BadRequestException("This transfer is not waiting to be received");
      if (doc.status !== "POSTED") throw new BadRequestException("This transfer is cancelled");
      if (doc.toBranchId !== branchId || (user && !user.branchIds.includes(doc.toBranchId))) {
        throw new BadRequestException("Switch to the receiving branch to receive this transfer");
      }
      const date = new Date();
      for (const l of doc.lines) {
        const r = input.lines.find((x) => x.lineId === l.id);
        if (!r) throw new BadRequestException(`Enter the received quantity for ${l.product.sku}`);
        if (r.receivedPcs + r.damagedPcs > l.qtyPcs) throw new BadRequestException(`${l.product.sku}: received + damaged is more than was sent`);
        const toRackId = r.toRackId ?? l.toRackId ?? null;
        await rackInGodown(tx, toRackId, doc.toGodownId);
        const base = { branchId: doc.toBranchId, productId: l.productId, batchId: l.batchId, godownId: doc.toGodownId, refType: "TRANSFER_RECEIVE", refId: doc.id, refLineId: l.id, postedAt: date, note: doc.number };
        await this.ledger.post(tx, [
          { ...base, rackId: null, stockType: "IN_TRANSIT", qtyPcs: -l.qtyPcs },
          { ...base, rackId: toRackId, stockType: "SALEABLE", qtyPcs: r.receivedPcs },
          { ...base, rackId: toRackId, stockType: "DAMAGED", qtyPcs: r.damagedPcs },
        ]);
        await tx.stockTransferLine.update({ where: { id: l.id }, data: { receivedPcs: r.receivedPcs, damagedPcs: r.damagedPcs, toRackId, ...stampUpdate() } });
        const missing = l.qtyPcs - r.receivedPcs - r.damagedPcs;
        if (r.damagedPcs > 0 || missing > 0) {
          const bkNo = await this.numbering.next(tx, doc.toBranchId, "BREAKAGE", date);
          await tx.breakageEntry.create({
            data: {
              branchId: doc.toBranchId,
              number: bkNo,
              date,
              stage: "TRANSIT",
              productId: l.productId,
              batchId: l.batchId,
              godownId: doc.toGodownId,
              rackId: toRackId,
              qtyPcs: r.damagedPcs + missing,
              reason: [r.damagedPcs ? `${r.damagedPcs} pcs broken` : "", missing ? `${missing} pcs short` : ""].filter(Boolean).join(", ") + ` on transfer ${doc.number}` + (input.note ? ` — ${input.note}` : ""),
              photos: [],
              status: "POSTED",
              refType: "stock_transfer",
              refId: doc.id,
              ...stampCreate(),
            },
          });
        }
      }
      const after = await tx.stockTransfer.update({
        where: { id },
        data: { transitState: "RECEIVED", receivedAt: date, receivedById: user?.id ?? null, ...stampUpdate() },
      });
      await this.audit.log({ entity: "stock_transfer", entityId: id, action: "receive", before: doc, after: { ...after, lines: input.lines } }, tx);
      return after;
    });
  }

  async cancelTransfer(id: string) {
    return this.prisma.tx(async (tx) => {
      const doc = await tx.stockTransfer.findFirst({ where: { id, deletedAt: null } });
      if (!doc) throw new NotFoundException("Transfer not found");
      if (doc.status !== "POSTED") throw new BadRequestException("Only posted transfers can be cancelled");
      if (doc.transitState === "RECEIVED") throw new BadRequestException("This transfer is already received at the other branch; transfer the stock back instead");
      await reverseLedger(tx, this.ledger, "TRANSFER", id, `Cancel ${doc.number}`);
      const after = await tx.stockTransfer.update({ where: { id }, data: { status: "CANCELLED", ...stampUpdate() } });
      await this.audit.log({ entity: "stock_transfer", entityId: id, action: "cancel", before: doc, after }, tx);
      return after;
    });
  }

  /** direction: all (sent from or arriving at this branch), outgoing, incoming (waiting to be received). */
  listTransfers(branchId: string, q: ListQuery & { status?: string; direction?: string }) {
    const scope: Prisma.StockTransferWhereInput =
      q.direction === "incoming"
        ? { toBranchId: branchId, transitState: "IN_TRANSIT", status: "POSTED" }
        : q.direction === "outgoing"
          ? { branchId, toBranchId: { not: null } }
          : { OR: [{ branchId }, { toBranchId: branchId }] };
    return paginate(this.prisma.stockTransfer, q, {
      where: { deletedAt: null, ...scope, ...(q.status ? { status: q.status as never } : {}), ...searchWhere(q.q, ["number", "notes", "vehicleNo"]) },
      include: {
        fromGodown: { select: { name: true, branch: { select: { code: true } } } },
        toGodown: { select: { name: true, branch: { select: { code: true } } } },
        _count: { select: { lines: true } },
      },
      orderBy: { date: "desc" },
    });
  }

  async getTransfer(branchId: string, id: string) {
    const doc = await this.prisma.stockTransfer.findFirst({
      where: { id, deletedAt: null, OR: [{ branchId }, { toBranchId: branchId }] },
      include: {
        fromGodown: { include: { branch: { select: { id: true, code: true, name: true } } } },
        toGodown: { include: { branch: { select: { id: true, code: true, name: true } } } },
        lines: { where: { deletedAt: null }, include: { product: { select: productUnitSelect }, batch: { select: { batchNo: true, shadeCode: true, caliber: true, grade: true } } } },
      },
    });
    if (!doc) throw new NotFoundException("Transfer not found");
    const lines = doc.lines.map((l) => ({ ...l, text: qtyText(l.qtyPcs, l.product), weightKg: Math.round(weightKg(l.qtyPcs, l.product) * 10) / 10 }));
    const totalWeightKg = Math.round(lines.reduce((a, l) => a + l.weightKg, 0) * 10) / 10;
    return { ...doc, lines, totalWeightKg, canReceive: doc.transitState === "IN_TRANSIT" && doc.status === "POSTED" && doc.toBranchId === branchId };
  }

  // ------------------------------------------------------------------ adjustments

  async createAdjustment(branchId: string, input: InventoryAdjustmentInput) {
    return this.prisma.tx(async (tx) => {
      await godownInBranch(tx, input.godownId, branchId);
      for (const l of input.lines) await rackInGodown(tx, l.rackId, input.godownId);
      const date = input.date ?? new Date();
      const number = await this.numbering.next(tx, branchId, "ADJUSTMENT", date);
      const doc = await tx.stockAdjustment.create({
        data: {
          branchId,
          number,
          date,
          godownId: input.godownId,
          reason: input.reason,
          status: "DRAFT",
          ...stampCreate(),
          lines: { create: input.lines.map((l) => ({ ...l, rackId: l.rackId ?? null, ...stampCreate() })) },
        },
        include: { lines: true },
      });
      await this.audit.log({ entity: "stock_adjustment", entityId: doc.id, action: "create", after: doc }, tx);
      return doc;
    });
  }

  async updateAdjustment(branchId: string, id: string, input: InventoryAdjustmentInput) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.stockAdjustment.findFirst({ where: { id, branchId, deletedAt: null }, include: { lines: true } });
      if (!before) throw new NotFoundException("Adjustment not found");
      if (before.status !== "DRAFT") throw new BadRequestException("Only draft adjustments can be edited");
      await godownInBranch(tx, input.godownId, branchId);
      await tx.stockAdjustmentLine.deleteMany({ where: { adjustmentId: id } });
      const after = await tx.stockAdjustment.update({
        where: { id },
        data: {
          godownId: input.godownId,
          reason: input.reason,
          date: input.date ?? before.date,
          ...stampUpdate(),
          lines: { create: input.lines.map((l) => ({ ...l, rackId: l.rackId ?? null, ...stampCreate() })) },
        },
        include: { lines: true },
      });
      await this.audit.log({ entity: "stock_adjustment", entityId: id, action: "update", before, after }, tx);
      return after;
    });
  }

  async submitAdjustment(branchId: string, id: string) {
    return this.prisma.tx(async (tx) => {
      const doc = await tx.stockAdjustment.findFirst({ where: { id, branchId, deletedAt: null }, include: { lines: true } });
      if (!doc) throw new NotFoundException("Adjustment not found");
      if (doc.status !== "DRAFT") throw new BadRequestException("Only draft adjustments can be submitted");
      const net = doc.lines.reduce((a, l) => a + l.qtyPcs, 0);
      const approval = await this.approvals.request(tx, {
        type: "ADJUSTMENT",
        refType: "stock_adjustment",
        refId: id,
        branchId,
        reason: `Stock adjustment ${doc.number}: ${doc.reason} (${doc.lines.length} line(s), net ${net > 0 ? "+" : ""}${net} pcs)`,
        link: `/inventory/adjustments/${id}`,
      });
      const after = await tx.stockAdjustment.update({ where: { id }, data: { status: "PENDING_APPROVAL", approvalId: approval.id, ...stampUpdate() } });
      await this.audit.log({ entity: "stock_adjustment", entityId: id, action: "submit", before: doc, after }, tx);
      return after;
    });
  }

  private async applyAdjustmentDecision(tx: Tx, req: ApprovalRequest, approved: boolean) {
    const doc = await tx.stockAdjustment.findUnique({ where: { id: req.refId }, include: { lines: true } });
    if (!doc || doc.status !== "PENDING_APPROVAL") return;
    if (approved) {
      // removals first so the check sees the real balance
      const lines = [...doc.lines].sort((a, b) => a.qtyPcs - b.qtyPcs);
      await this.ledger.post(
        tx,
        lines.map((l) => ({
          branchId: doc.branchId,
          productId: l.productId,
          batchId: l.batchId,
          godownId: doc.godownId,
          rackId: l.rackId,
          qtyPcs: l.qtyPcs,
          stockType: l.stockType as StockType,
          refType: "ADJUSTMENT",
          refId: doc.id,
          refLineId: l.id,
          note: doc.reason,
          postedAt: new Date(),
        })),
      );
    }
    const after = await tx.stockAdjustment.update({ where: { id: doc.id }, data: { status: approved ? "POSTED" : "CANCELLED", updatedBy: ctx().user?.id ?? null } });
    await this.audit.log({ entity: "stock_adjustment", entityId: doc.id, action: approved ? "approve" : "reject", before: doc, after }, tx);
  }

  listAdjustments(branchId: string, q: ListQuery & { status?: string }) {
    return paginate(this.prisma.stockAdjustment, q, {
      where: { branchId, deletedAt: null, ...(q.status ? { status: q.status as never } : {}), ...searchWhere(q.q, ["number", "reason"]) },
      include: { godown: { select: { name: true } }, _count: { select: { lines: true } } },
      orderBy: { date: "desc" },
    });
  }

  async getAdjustment(branchId: string, id: string) {
    const doc = await this.prisma.stockAdjustment.findFirst({
      where: { id, branchId, deletedAt: null },
      include: { godown: true, lines: { include: { product: { select: productUnitSelect }, batch: { select: { batchNo: true, shadeCode: true, caliber: true, grade: true } } } } },
    });
    if (!doc) throw new NotFoundException("Adjustment not found");
    return { ...doc, lines: doc.lines.map((l) => ({ ...l, text: qtyText(l.qtyPcs, l.product) })) };
  }

  // ------------------------------------------------------------------ breakage

  async createBreakage(branchId: string, input: InventoryBreakageInput) {
    return this.prisma.tx(async (tx) => {
      await godownInBranch(tx, input.godownId, branchId);
      await rackInGodown(tx, input.rackId, input.godownId);
      const batch = await tx.batch.findFirst({ where: { id: input.batchId, productId: input.productId } });
      if (!batch) throw new BadRequestException("Batch does not belong to the product");
      const date = input.date ?? new Date();
      const number = await this.numbering.next(tx, branchId, "BREAKAGE", date);
      const doc = await tx.breakageEntry.create({
        data: { branchId, number, date, ...input, rackId: input.rackId ?? null, status: "POSTED", ...stampCreate() },
      });
      const base = { branchId, productId: input.productId, batchId: input.batchId, refType: "BREAKAGE", refId: doc.id, note: input.reason, postedAt: date };
      if (input.stage === "CUSTOMER") {
        // broken pieces coming back from a customer: straight into DAMAGED
        await this.ledger.post(tx, [{ ...base, godownId: input.godownId, rackId: input.rackId, qtyPcs: input.qtyPcs, stockType: "DAMAGED" }]);
      } else {
        const outs = input.rackId
          ? [{ ...base, godownId: input.godownId, rackId: input.rackId, stockType: "SALEABLE" as const, qtyPcs: -input.qtyPcs }]
          : await drawFromGodown(tx, { ...base, godownId: input.godownId, stockType: "SALEABLE", qtyPcs: input.qtyPcs });
        // damaged pieces stay where they were found
        await this.ledger.post(tx, [...outs, ...outs.map((o) => ({ ...o, stockType: "DAMAGED" as const, qtyPcs: -o.qtyPcs }))]);
      }
      await this.audit.log({ entity: "breakage_entry", entityId: doc.id, action: "post", after: doc }, tx);
      return doc;
    });
  }

  /** Write off damaged stock: needs a WRITE_OFF approval; the ledger posts on approval. */
  async requestWriteOff(branchId: string, id: string, reason: string) {
    return this.prisma.tx(async (tx) => {
      const doc = await tx.breakageEntry.findFirst({ where: { id, branchId, deletedAt: null }, include: { product: { select: { sku: true, name: true } } } });
      if (!doc) throw new NotFoundException("Breakage entry not found");
      if (doc.status !== "POSTED") throw new BadRequestException("This breakage is already written off or pending");
      await this.approvals.request(tx, {
        type: "WRITE_OFF",
        refType: "breakage_entry",
        refId: id,
        branchId,
        reason: `Write off ${doc.qtyPcs} pcs ${doc.product.sku} (${doc.number}): ${reason}`,
        link: `/inventory/breakage`,
      });
      const after = await tx.breakageEntry.update({ where: { id }, data: { status: "PENDING_APPROVAL", ...stampUpdate() } });
      await this.audit.log({ entity: "breakage_entry", entityId: id, action: "request_write_off", before: doc, after }, tx);
      return after;
    });
  }

  private async applyWriteOffDecision(tx: Tx, req: ApprovalRequest, approved: boolean) {
    const doc = await tx.breakageEntry.findUnique({ where: { id: req.refId } });
    if (!doc || doc.status !== "PENDING_APPROVAL") return;
    if (approved) {
      await this.ledger.post(tx, [
        {
          branchId: doc.branchId,
          productId: doc.productId,
          batchId: doc.batchId,
          godownId: doc.godownId,
          rackId: doc.rackId,
          qtyPcs: -doc.qtyPcs,
          stockType: "DAMAGED",
          refType: "WRITE_OFF",
          refId: doc.id,
          note: req.reason,
        },
      ]);
    }
    const after = await tx.breakageEntry.update({
      where: { id: doc.id },
      data: { status: approved ? "COMPLETED" : "POSTED", approvedById: approved ? (ctx().user?.id ?? null) : null, updatedBy: ctx().user?.id ?? null },
    });
    await this.audit.log({ entity: "breakage_entry", entityId: doc.id, action: approved ? "write_off" : "write_off_rejected", before: doc, after }, tx);
  }

  listBreakage(branchId: string, q: ListQuery & { stage?: string; status?: string }) {
    return paginate(this.prisma.breakageEntry, q, {
      where: {
        branchId,
        deletedAt: null,
        ...(q.stage ? { stage: q.stage as never } : {}),
        ...(q.status ? { status: q.status as never } : {}),
        ...searchWhere(q.q, ["number", "reason", "product.name", "product.sku"]),
      },
      include: { product: { select: productUnitSelect }, batch: { select: { batchNo: true, shadeCode: true } }, godown: { select: { name: true } } },
      orderBy: { date: "desc" },
    });
  }

  // ------------------------------------------------------------------ reports

  private async totalsByProduct(branchId: string, productIds?: string[]) {
    const rows = await this.prisma.stockBalance.groupBy({
      by: ["productId", "stockType"],
      where: { branchId, ...(productIds ? { productId: { in: productIds } } : {}) },
      _sum: { qtyPcs: true },
    });
    const map = new Map<string, QtyTotals>();
    for (const r of rows) {
      const t = map.get(r.productId) ?? emptyTotals();
      addToTotals(t, r.stockType, r._sum.qtyPcs ?? 0);
      map.set(r.productId, t);
    }
    return map;
  }

  private pageOf<T>(all: T[], q: ListQuery, extra: Record<string, unknown> = {}) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 25;
    return { items: all.slice((page - 1) * pageSize, page * pageSize), total: all.length, page, pageSize, ...extra };
  }

  async lowStock(branchId: string, q: ListQuery) {
    const products = await this.prisma.product.findMany({
      where: { deletedAt: null, isActive: true, reorderLevelPcs: { gt: 0 }, ...searchWhere(q.q, ["name", "sku"]) },
      select: productUnitSelect,
      orderBy: { name: "asc" },
    });
    const totals = await this.totalsByProduct(branchId, products.map((p) => p.id));
    const rows = products
      .map((p) => {
        const t = totals.get(p.id) ?? emptyTotals();
        return { ...p, ...t, shortPcs: p.reorderLevelPcs - t.available, availableText: qtyText(t.available, p), reorderText: qtyText(p.reorderLevelPcs, p) };
      })
      .filter((r) => r.available < r.reorderLevelPcs)
      .sort((a, b) => b.shortPcs - a.shortPcs);
    return this.pageOf(rows, q);
  }

  async deadStock(branchId: string, q: ListQuery & { days?: number }) {
    const days = q.days ?? (await this.settings.get<number>("stock.deadStockDays")) ?? 180;
    const cutoff = new Date(Date.now() - days * 86_400_000);
    const totals = await this.totalsByProduct(branchId);
    const withStock = [...totals.entries()].filter(([, t]) => t.saleable + t.display > 0).map(([id]) => id);
    const lastOut = await this.prisma.stockLedger.groupBy({
      by: ["productId"],
      where: { branchId, productId: { in: withStock }, qtyPcs: { lt: 0 }, refType: { notIn: ["TRANSFER", "TRANSFER_CANCEL", "ADJUSTMENT", "BREAKAGE"] } },
      _max: { postedAt: true },
    });
    const firstIn = await this.prisma.stockLedger.groupBy({ by: ["productId"], where: { branchId, productId: { in: withStock }, qtyPcs: { gt: 0 } }, _min: { postedAt: true } });
    const products = await this.prisma.product.findMany({ where: { id: { in: withStock }, deletedAt: null, ...searchWhere(q.q, ["name", "sku"]) }, select: productUnitSelect });
    const rows = products
      .map((p) => {
        const last = lastOut.find((r) => r.productId === p.id)?._max.postedAt ?? null;
        const since = last ?? firstIn.find((r) => r.productId === p.id)?._min.postedAt ?? null;
        const t = totals.get(p.id)!;
        return { ...p, ...t, lastOutAt: last, idleDays: since ? daysBetween(since) : null, stockText: qtyText(t.saleable + t.display, p) };
      })
      .filter((r) => !r.lastOutAt || r.lastOutAt < cutoff)
      .filter((r) => r.idleDays === null || r.idleDays >= days || !r.lastOutAt)
      .sort((a, b) => (b.idleDays ?? 0) - (a.idleDays ?? 0));
    return this.pageOf(rows, q, { days });
  }

  async ageing(branchId: string, q: ListQuery) {
    const balances = await this.prisma.stockBalance.findMany({
      where: { branchId, stockType: { in: ["SALEABLE", "DISPLAY"] }, qtyPcs: { gt: 0 }, ...(q.q ? { OR: [{ product: { name: { contains: q.q, mode: "insensitive" } } }, { product: { sku: { contains: q.q, mode: "insensitive" } } }] } : {}) },
      include: { product: { select: productUnitSelect }, batch: true },
    });
    const byBatch = new Map<string, any>();
    for (const b of balances) {
      const cur = byBatch.get(b.batchId) ?? { id: b.batchId, product: b.product, batch: stripBatchCost(b.batch), qtyPcs: 0 };
      cur.qtyPcs += b.qtyPcs;
      byBatch.set(b.batchId, cur);
    }
    const cost = canSeeCost();
    const buckets: Record<string, { qtyPcs: number; valuePaise: number; batches: number }> = {};
    const rows = [...byBatch.values()]
      .map((r) => {
        const ageDays = daysBetween(r.batch.createdAt);
        const bucket = ageingBucket(ageDays);
        const valuePaise = cost ? r.qtyPcs * Number(r.batch.landedCostPaise ?? 0) : undefined;
        buckets[bucket] ??= { qtyPcs: 0, valuePaise: 0, batches: 0 };
        buckets[bucket].qtyPcs += r.qtyPcs;
        buckets[bucket].batches += 1;
        buckets[bucket].valuePaise += valuePaise ?? 0;
        return { ...r, ageDays, bucket, valuePaise, text: qtyText(r.qtyPcs, r.product) };
      })
      .sort((a, b) => b.ageDays - a.ageDays);
    return this.pageOf(rows, q, { buckets });
  }

  async stockValue(branchId: string, q: ListQuery) {
    const balances = await this.prisma.stockBalance.findMany({
      where: { branchId, qtyPcs: { gt: 0 }, stockType: { in: ["SALEABLE", "DISPLAY", "DAMAGED"] } },
      include: { batch: { select: { landedCostPaise: true } }, product: { select: productUnitSelect } },
    });
    const map = new Map<string, any>();
    let grand = 0;
    let damagedValue = 0;
    for (const b of balances) {
      const v = b.qtyPcs * Number(b.batch.landedCostPaise);
      const cur = map.get(b.productId) ?? { ...b.product, qtyPcs: 0, valuePaise: 0, damagedPcs: 0, damagedValuePaise: 0 };
      if (b.stockType === "DAMAGED") {
        cur.damagedPcs += b.qtyPcs;
        cur.damagedValuePaise += v;
        damagedValue += v;
      } else {
        cur.qtyPcs += b.qtyPcs;
        cur.valuePaise += v;
        grand += v;
      }
      map.set(b.productId, cur);
    }
    const term = q.q?.toLowerCase();
    const rows = [...map.values()]
      .filter((r) => !term || r.name.toLowerCase().includes(term) || r.sku.toLowerCase().includes(term))
      .map((r) => ({ ...r, text: qtyText(r.qtyPcs, r) }))
      .sort((a, b) => b.valuePaise - a.valuePaise);
    return this.pageOf(rows, q, { totalValuePaise: grand, damagedValuePaise: damagedValue });
  }
}
