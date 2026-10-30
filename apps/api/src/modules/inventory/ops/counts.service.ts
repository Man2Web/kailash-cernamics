import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from "@nestjs/common";
import { ApprovalRequest, Prisma, StockType } from "@prisma/client";
import { formatQty, ListQuery, OpsCountCreateInput, OpsCountFoundInput, OpsCountLinesInput } from "@gc/shared";
import { PrismaService, Tx } from "../../../prisma/prisma.service";
import { LedgerService, balanceKey } from "../../../core/ledger.service";
import { NumberingService } from "../../../core/numbering.service";
import { ApprovalService } from "../../../core/approval.service";
import { AuditService } from "../../../core/audit.service";
import { ctx, stampCreate, stampUpdate } from "../../../common/context";
import { paginate, searchWhere } from "../../../common/pagination";
import { canSeeCost, godownInBranch, productUnitSelect, rackInGodown } from "../stock-helpers";

const COUNTED_TYPES: StockType[] = ["SALEABLE", "DISPLAY"];

/**
 * Physical stock count of a godown (optionally one rack, brand or category). Lines snapshot the
 * system balance when the count starts; counters enter what they find (blind by default); the
 * variance posts to the ledger only after an ADJUSTMENT approval.
 */
@Injectable()
export class CountsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly numbering: NumberingService,
    private readonly approvals: ApprovalService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    this.approvals.registerHandler("stock_count", (tx, req, approved) => this.applyDecision(tx, req, approved));
  }

  async create(branchId: string, input: OpsCountCreateInput) {
    return this.prisma.tx(async (tx) => {
      await godownInBranch(tx, input.godownId, branchId);
      await rackInGodown(tx, input.rackId, input.godownId);
      const balances = await tx.stockBalance.findMany({
        where: {
          branchId,
          godownId: input.godownId,
          ...(input.rackId ? { rackId: input.rackId } : {}),
          stockType: { in: COUNTED_TYPES },
          qtyPcs: { gt: 0 },
          product: { deletedAt: null, ...(input.brandId ? { brandId: input.brandId } : {}), ...(input.categoryId ? { categoryId: input.categoryId } : {}) },
        },
      });
      if (!balances.length) throw new BadRequestException("No stock in this location to count");
      const date = input.date ?? new Date();
      const number = await this.numbering.next(tx, branchId, "STOCK_COUNT", date);
      const doc = await tx.stockCount.create({
        data: {
          branchId,
          number,
          date,
          godownId: input.godownId,
          rackId: input.rackId ?? null,
          brandId: input.brandId ?? null,
          categoryId: input.categoryId ?? null,
          blind: input.blind,
          notes: input.notes ?? null,
          status: "COUNTING",
          ...stampCreate(),
          lines: {
            create: balances.map((b) => ({ productId: b.productId, batchId: b.batchId, rackId: b.rackId, stockType: b.stockType, systemPcs: b.qtyPcs, ...stampCreate() })),
          },
        },
      });
      await this.audit.log({ entity: "stock_count", entityId: doc.id, action: "create", after: { ...doc, lines: balances.length } }, tx);
      return doc;
    });
  }

  list(branchId: string, q: ListQuery & { status?: string }) {
    return paginate(this.prisma.stockCount, q, {
      where: { branchId, deletedAt: null, ...(q.status ? { status: q.status as never } : {}), ...searchWhere(q.q, ["number", "notes"]) },
      include: { godown: { select: { name: true } }, _count: { select: { lines: true } } },
      orderBy: { date: "desc" },
    });
  }

  async get(branchId: string, id: string) {
    const doc = await this.prisma.stockCount.findFirst({
      where: { id, branchId, deletedAt: null },
      include: {
        godown: { select: { id: true, name: true } },
        lines: {
          where: { deletedAt: null },
          include: {
            product: { select: productUnitSelect },
            batch: { select: { id: true, batchNo: true, shadeCode: true, caliber: true, grade: true, landedCostPaise: true } },
          },
          orderBy: [{ rackId: "asc" }, { product: { name: "asc" } }],
        },
      },
    });
    if (!doc) throw new NotFoundException("Stock count not found");
    const racks = await this.prisma.rack.findMany({ where: { godownId: doc.godownId }, select: { id: true, code: true } });
    const user = ctx().user;
    const hideSystem = doc.blind && (doc.status === "COUNTING" || doc.status === "DRAFT") && !user?.permissions.has("stock.adjust");
    const cost = canSeeCost();
    let plus = 0;
    let minus = 0;
    let valuePaise = 0;
    const lines = doc.lines.map((l) => {
      const counted = l.countedPcs !== null;
      const variance = counted ? l.countedPcs! - l.systemPcs : 0;
      if (variance > 0) plus += variance;
      if (variance < 0) minus += variance;
      valuePaise += variance * Number(l.batch.landedCostPaise);
      const { landedCostPaise: _c, ...batch } = l.batch;
      return {
        ...l,
        batch,
        rack: racks.find((r) => r.id === l.rackId) ?? null,
        systemPcs: hideSystem ? null : l.systemPcs,
        systemText: hideSystem ? null : formatQty(l.systemPcs, l.product),
        countedText: counted ? formatQty(l.countedPcs!, l.product) : null,
        variancePcs: hideSystem ? null : variance,
        varianceText: hideSystem || !counted ? null : formatQty(variance, l.product),
      };
    });
    const countedLines = doc.lines.filter((l) => l.countedPcs !== null).length;
    return {
      ...doc,
      lines,
      hideSystem,
      progress: { counted: countedLines, total: doc.lines.length },
      variance: hideSystem ? null : { plusPcs: plus, minusPcs: minus, linesDiffering: lines.filter((l) => l.variancePcs).length, valuePaise: cost ? valuePaise : undefined },
    };
  }

  private async editable(tx: Tx, branchId: string, id: string) {
    const doc = await tx.stockCount.findFirst({ where: { id, branchId, deletedAt: null } });
    if (!doc) throw new NotFoundException("Stock count not found");
    if (doc.status !== "COUNTING") throw new BadRequestException(`This count is ${doc.status.toLowerCase().replace("_", " ")}`);
    return doc;
  }

  async saveLines(branchId: string, id: string, input: OpsCountLinesInput) {
    const userId = ctx().user?.id ?? null;
    return this.prisma.tx(async (tx) => {
      await this.editable(tx, branchId, id);
      for (const l of input.lines) {
        const line = await tx.stockCountLine.findFirst({ where: { id: l.lineId, countId: id, deletedAt: null } });
        if (!line) throw new BadRequestException("Line is not on this count");
        await tx.stockCountLine.update({
          where: { id: line.id },
          data: {
            countedPcs: l.countedPcs,
            variancePcs: l.countedPcs === null ? 0 : l.countedPcs - line.systemPcs,
            note: l.note ?? line.note,
            countedById: l.countedPcs === null ? null : userId,
            countedAt: l.countedPcs === null ? null : new Date(),
            ...stampUpdate(),
          },
        });
      }
      await this.audit.log({ entity: "stock_count", entityId: id, action: "count", after: input.lines }, tx);
      return { ok: true, saved: input.lines.length };
    });
  }

  /** Stock found in this location that the count didn't list (wrong rack, unrecorded receipt…). */
  async addFound(branchId: string, id: string, input: OpsCountFoundInput) {
    return this.prisma.tx(async (tx) => {
      const doc = await this.editable(tx, branchId, id);
      const batch = await tx.batch.findFirst({ where: { id: input.batchId, productId: input.productId, deletedAt: null } });
      if (!batch) throw new BadRequestException("Batch does not belong to this product");
      const rackId = input.rackId ?? doc.rackId ?? null;
      await rackInGodown(tx, rackId, doc.godownId);
      const existing = await tx.stockCountLine.findFirst({ where: { countId: id, productId: input.productId, batchId: input.batchId, rackId, stockType: "SALEABLE", deletedAt: null } });
      if (existing) throw new BadRequestException("This shade is already on the count sheet for that rack — update that line");
      const bal = await tx.stockBalance.findUnique({ where: { key: balanceKey({ productId: input.productId, batchId: input.batchId, godownId: doc.godownId, rackId, stockType: "SALEABLE" }) } });
      const systemPcs = Math.max(0, bal?.qtyPcs ?? 0);
      const line = await tx.stockCountLine.create({
        data: {
          countId: id,
          productId: input.productId,
          batchId: input.batchId,
          rackId,
          stockType: "SALEABLE",
          systemPcs,
          countedPcs: input.countedPcs,
          variancePcs: input.countedPcs - systemPcs,
          countedById: ctx().user?.id ?? null,
          countedAt: new Date(),
          note: input.note ?? "Found during count",
          ...stampCreate(),
        },
      });
      await this.audit.log({ entity: "stock_count", entityId: id, action: "add_found", after: line }, tx);
      return line;
    });
  }

  async submit(branchId: string, id: string, treatUncountedAsZero: boolean) {
    return this.prisma.tx(async (tx) => {
      const doc = await this.editable(tx, branchId, id);
      const lines = await tx.stockCountLine.findMany({ where: { countId: id, deletedAt: null }, include: { product: { select: { sku: true } } } });
      const uncounted = lines.filter((l) => l.countedPcs === null);
      if (uncounted.length && !treatUncountedAsZero) {
        throw new BadRequestException(`${uncounted.length} line(s) not counted yet. Count them or submit treating them as zero.`);
      }
      for (const l of uncounted) {
        await tx.stockCountLine.update({ where: { id: l.id }, data: { countedPcs: 0, variancePcs: -l.systemPcs, countedAt: new Date(), countedById: ctx().user?.id ?? null } });
      }
      const fresh = await tx.stockCountLine.findMany({ where: { countId: id, deletedAt: null } });
      const differing = fresh.filter((l) => l.variancePcs !== 0);
      if (!differing.length) {
        const after = await tx.stockCount.update({ where: { id }, data: { status: "POSTED", ...stampUpdate() } });
        await this.audit.log({ entity: "stock_count", entityId: id, action: "post", before: doc, after }, tx);
        return after;
      }
      const plus = differing.filter((l) => l.variancePcs > 0).reduce((a, l) => a + l.variancePcs, 0);
      const minus = differing.filter((l) => l.variancePcs < 0).reduce((a, l) => a + l.variancePcs, 0);
      const req = await this.approvals.request(tx, {
        type: "ADJUSTMENT",
        refType: "stock_count",
        refId: id,
        branchId,
        reason: `Stock count ${doc.number}: ${differing.length} line(s) differ (+${plus} / ${minus} pcs)`,
        payload: { plusPcs: plus, minusPcs: minus, lines: differing.length },
        link: `/inventory/counts/${id}`,
      });
      const after = await tx.stockCount.update({ where: { id }, data: { status: "PENDING_APPROVAL", approvalId: req.id, ...stampUpdate() } });
      await this.audit.log({ entity: "stock_count", entityId: id, action: "submit", before: doc, after }, tx);
      return after;
    });
  }

  private async applyDecision(tx: Tx, req: ApprovalRequest, approved: boolean) {
    const doc = await tx.stockCount.findUnique({ where: { id: req.refId }, include: { lines: { where: { deletedAt: null } } } });
    if (!doc || doc.status !== "PENDING_APPROVAL") return;
    if (!approved) {
      await tx.stockCount.update({ where: { id: doc.id }, data: { status: "COUNTING", approvalId: null } });
      return;
    }
    const entries = doc.lines
      .filter((l) => l.variancePcs !== 0)
      .map((l) => ({
        branchId: doc.branchId,
        productId: l.productId,
        batchId: l.batchId,
        godownId: doc.godownId,
        rackId: l.rackId,
        stockType: l.stockType,
        qtyPcs: l.variancePcs,
        refType: "STOCK_COUNT",
        refId: doc.id,
        refLineId: l.id,
        note: `Count ${doc.number}`,
      }));
    // take stock out first so a decrease never fails because an increase hasn't posted yet
    entries.sort((a, b) => a.qtyPcs - b.qtyPcs);
    await this.ledger.post(tx, entries);
    await tx.stockCount.update({ where: { id: doc.id }, data: { status: "POSTED" } });
    await this.audit.log({ entity: "stock_count", entityId: doc.id, action: "post_variance", after: { lines: entries.length } }, tx);
  }

  async cancel(branchId: string, id: string) {
    return this.prisma.tx(async (tx) => {
      const doc = await tx.stockCount.findFirst({ where: { id, branchId, deletedAt: null } });
      if (!doc) throw new NotFoundException("Stock count not found");
      if (doc.status === "POSTED" || doc.status === "CANCELLED") throw new BadRequestException(`This count is already ${doc.status.toLowerCase()}`);
      if (doc.approvalId) {
        await tx.approvalRequest.updateMany({ where: { id: doc.approvalId, status: "PENDING" }, data: { status: "REJECTED", decisionNote: "Count cancelled", decidedAt: new Date() } });
      }
      const after = await tx.stockCount.update({ where: { id }, data: { status: "CANCELLED", ...stampUpdate() } });
      await this.audit.log({ entity: "stock_count", entityId: id, action: "cancel", before: doc, after }, tx);
      return after;
    });
  }
}

export type CountWhere = Prisma.StockCountWhereInput;
