import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AllocationBasis, Prisma } from "@prisma/client";
import {
  allocateLandedCost,
  computeDocTotals,
  computeLine,
  isInterState,
  ListQuery,
  PurchaseDebitNoteInput,
  PurchaseGrnInput,
  PurchaseInvoiceInput,
  PurchaseOrderInput,
  PurchaseSchemeInput,
  schemeSlabFor,
} from "@gc/shared";
import { PrismaService, Tx } from "../../prisma/prisma.service";
import { LedgerEntry, LedgerService } from "../../core/ledger.service";
import { NumberingService } from "../../core/numbering.service";
import { AuditService } from "../../core/audit.service";
import { SettingsService } from "../../core/settings.service";
import { TallyQueueService } from "../../core/tally-queue.service";
import { stampCreate, stampUpdate } from "../../common/context";
import { paginate, searchWhere } from "../../common/pagination";
import { canSeeCost, drawFromGodown, godownInBranch, productUnitSelect, qtyText, rackInGodown, reverseLedger } from "../inventory/stock-helpers";

const docInclude = { supplier: { select: { id: true, name: true, gstin: true, stateCode: true, phone: true } } } as const;

function statusFilter(status?: string) {
  return status ? { status: status as never } : {};
}

@Injectable()
export class PurchaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly numbering: NumberingService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly tally: TallyQueueService,
  ) {}

  private async supplier(db: Tx | PrismaService, id: string) {
    const s = await db.party.findFirst({ where: { id, deletedAt: null } });
    if (!s) throw new NotFoundException("Supplier not found");
    if (s.type === "CUSTOMER") throw new BadRequestException(`${s.name} is not a supplier`);
    return s;
  }

  private async branch(db: Tx | PrismaService, id: string) {
    return db.branch.findUniqueOrThrow({ where: { id } });
  }

  // ------------------------------------------------------------------ purchase orders

  listOrders(branchId: string, q: ListQuery & { status?: string; supplierId?: string }) {
    return paginate(this.prisma.purchaseOrder, q, {
      where: { branchId, deletedAt: null, ...statusFilter(q.status), ...(q.supplierId ? { supplierId: q.supplierId } : {}), ...searchWhere(q.q, ["number", "supplier.name", "notes"]) },
      include: { ...docInclude, _count: { select: { lines: true } } },
      orderBy: { date: "desc" },
    });
  }

  async getOrder(branchId: string, id: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, branchId, deletedAt: null },
      include: { ...docInclude, lines: { include: { product: { select: { ...productUnitSelect, gstRate: true, hsn: true } } } } },
    });
    if (!po) throw new NotFoundException("Purchase order not found");
    return { ...po, lines: po.lines.map((l) => ({ ...l, text: qtyText(l.qtyPcs, l.product), receivedText: qtyText(l.receivedPcs, l.product) })) };
  }

  private async poTotals(tx: Tx, branchId: string, supplierId: string, lines: PurchaseOrderInput["lines"]) {
    const [branch, supplier] = await Promise.all([this.branch(tx, branchId), this.supplier(tx, supplierId)]);
    const totals = computeDocTotals(lines.map((l) => ({ qtyPcs: l.qtyPcs, ratePaise: l.ratePaise, gstRate: l.gstRate })), isInterState(branch.stateCode, supplier.stateCode));
    return totals;
  }

  async createOrder(branchId: string, input: PurchaseOrderInput) {
    return this.prisma.tx(async (tx) => {
      const totals = await this.poTotals(tx, branchId, input.supplierId, input.lines);
      const date = input.date ?? new Date();
      const number = await this.numbering.next(tx, branchId, "PURCHASE_ORDER", date);
      const po = await tx.purchaseOrder.create({
        data: {
          branchId,
          number,
          date,
          supplierId: input.supplierId,
          brandId: input.brandId ?? null,
          expectedDate: input.expectedDate ?? null,
          notes: input.notes ?? null,
          totalPaise: BigInt(totals.totalPaise),
          status: "DRAFT",
          ...stampCreate(),
          lines: { create: input.lines.map((l, i) => ({ ...l, ratePaise: BigInt(l.ratePaise), amountPaise: BigInt(totals.lines[i].taxablePaise), ...stampCreate() })) },
        },
        include: { lines: true },
      });
      await this.audit.log({ entity: "purchase_order", entityId: po.id, action: "create", after: po }, tx);
      return po;
    });
  }

  async updateOrder(branchId: string, id: string, input: PurchaseOrderInput) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.purchaseOrder.findFirst({ where: { id, branchId, deletedAt: null }, include: { lines: true } });
      if (!before) throw new NotFoundException("Purchase order not found");
      if (before.status !== "DRAFT") throw new BadRequestException("Only draft purchase orders can be edited");
      const totals = await this.poTotals(tx, branchId, input.supplierId, input.lines);
      await tx.purchaseOrderLine.deleteMany({ where: { poId: id } });
      const after = await tx.purchaseOrder.update({
        where: { id },
        data: {
          supplierId: input.supplierId,
          brandId: input.brandId ?? null,
          expectedDate: input.expectedDate ?? null,
          notes: input.notes ?? null,
          date: input.date ?? before.date,
          totalPaise: BigInt(totals.totalPaise),
          ...stampUpdate(),
          lines: { create: input.lines.map((l, i) => ({ ...l, ratePaise: BigInt(l.ratePaise), amountPaise: BigInt(totals.lines[i].taxablePaise), ...stampCreate() })) },
        },
        include: { lines: true },
      });
      await this.audit.log({ entity: "purchase_order", entityId: id, action: "update", before, after }, tx);
      return after;
    });
  }

  async setOrderStatus(branchId: string, id: string, action: "approve" | "cancel" | "close") {
    return this.prisma.tx(async (tx) => {
      const po = await tx.purchaseOrder.findFirst({ where: { id, branchId, deletedAt: null }, include: { lines: true } });
      if (!po) throw new NotFoundException("Purchase order not found");
      let status: "APPROVED" | "CANCELLED" | "COMPLETED";
      if (action === "approve") {
        if (po.status !== "DRAFT") throw new BadRequestException("Only draft purchase orders can be approved");
        status = "APPROVED";
      } else if (action === "cancel") {
        if (po.lines.some((l) => l.receivedPcs > 0)) throw new BadRequestException("Goods were already received against this PO; close it instead");
        if (po.status === "CANCELLED") throw new BadRequestException("Already cancelled");
        status = "CANCELLED";
      } else {
        if (!["APPROVED", "PARTIAL"].includes(po.status)) throw new BadRequestException("Only open purchase orders can be closed");
        status = "COMPLETED";
      }
      const after = await tx.purchaseOrder.update({ where: { id }, data: { status, ...stampUpdate() } });
      await this.audit.log({ entity: "purchase_order", entityId: id, action, before: po, after }, tx);
      return after;
    });
  }

  // ------------------------------------------------------------------ GRN

  listGrns(branchId: string, q: ListQuery & { status?: string; supplierId?: string; poId?: string }) {
    return paginate(this.prisma.grn, q, {
      where: {
        branchId,
        deletedAt: null,
        ...statusFilter(q.status),
        ...(q.supplierId ? { supplierId: q.supplierId } : {}),
        ...(q.poId ? { poId: q.poId } : {}),
        ...searchWhere(q.q, ["number", "supplier.name", "truckNo", "supplierInvoiceNo"]),
      },
      include: { ...docInclude, godown: { select: { name: true } }, po: { select: { number: true } }, _count: { select: { lines: true } } },
      orderBy: { date: "desc" },
    });
  }

  async getGrn(branchId: string, id: string) {
    const grn = await this.prisma.grn.findFirst({
      where: { id, branchId, deletedAt: null },
      include: {
        ...docInclude,
        godown: true,
        po: { select: { id: true, number: true } },
        lines: { include: { product: { select: { ...productUnitSelect, weightPerBoxKg: true } }, batch: true } },
      },
    });
    if (!grn) throw new NotFoundException("GRN not found");
    const cost = canSeeCost();
    const racks = await this.prisma.rack.findMany({ where: { id: { in: grn.lines.map((l) => l.rackId).filter(Boolean) as string[] } }, select: { id: true, code: true } });
    return {
      ...grn,
      lines: grn.lines.map((l) => ({
        ...l,
        rack: racks.find((r) => r.id === l.rackId) ?? null,
        landedRatePaise: cost ? l.landedRatePaise : undefined,
        batch: l.batch ? { ...l.batch, landedCostPaise: cost ? l.batch.landedCostPaise : undefined, purchaseRatePaise: cost ? l.batch.purchaseRatePaise : undefined } : null,
        text: qtyText(l.qtyPcs, l.product),
      })),
    };
  }

  private async validateGrn(tx: Tx, branchId: string, input: PurchaseGrnInput) {
    await this.supplier(tx, input.supplierId);
    await godownInBranch(tx, input.godownId, branchId);
    for (const l of input.lines) {
      await rackInGodown(tx, l.rackId, input.godownId);
      if (l.damagedPcs > l.qtyPcs) throw new BadRequestException("Damaged pieces cannot be more than received pieces");
    }
    if (input.poId) {
      const po = await tx.purchaseOrder.findFirst({ where: { id: input.poId, branchId, deletedAt: null } });
      if (!po) throw new NotFoundException("Purchase order not found");
      if (po.supplierId !== input.supplierId) throw new BadRequestException("PO belongs to a different supplier");
      if (!["APPROVED", "PARTIAL"].includes(po.status)) throw new BadRequestException(`PO ${po.number} is not open for receiving`);
    }
  }

  private grnData(input: PurchaseGrnInput) {
    return {
      supplierId: input.supplierId,
      poId: input.poId ?? null,
      godownId: input.godownId,
      supplierInvoiceNo: input.supplierInvoiceNo ?? null,
      truckNo: input.truckNo ?? null,
      containerNo: input.containerNo ?? null,
      freightPaise: BigInt(input.freightPaise),
      unloadingPaise: BigInt(input.unloadingPaise),
      otherChargesPaise: BigInt(input.otherChargesPaise),
      notes: input.notes ?? null,
    };
  }

  private grnLines(input: PurchaseGrnInput) {
    return input.lines.map((l) => ({
      poLineId: l.poLineId ?? null,
      productId: l.productId,
      batchNo: (l.batchNo ?? "").trim(),
      shadeCode: (l.shadeCode ?? "").trim(),
      caliber: (l.caliber ?? "").trim(),
      grade: l.grade,
      rackId: l.rackId ?? null,
      qtyPcs: l.qtyPcs,
      damagedPcs: l.damagedPcs,
      ratePaise: BigInt(l.ratePaise),
      amountPaise: BigInt(l.qtyPcs * l.ratePaise),
      ...stampCreate(),
    }));
  }

  /**
   * Sanitary/CP colour variants are stocked as their own lot: the line keeps batch "V-<suffix>" with
   * the colour as its shade, and posting links the batch to the variant.
   */
  private async resolveVariants(tx: Tx, input: PurchaseGrnInput): Promise<PurchaseGrnInput> {
    const lines = [];
    for (const [i, l] of input.lines.entries()) {
      if (!l.variantId) {
        lines.push(l);
        continue;
      }
      const v = await tx.productVariant.findFirst({ where: { id: l.variantId, deletedAt: null }, include: { color: true } });
      if (!v || v.productId !== l.productId) throw new BadRequestException(`Line ${i + 1}: colour variant does not belong to this product`);
      lines.push({ ...l, batchNo: `V-${v.skuSuffix}`, shadeCode: v.color?.name ?? v.name ?? v.skuSuffix, caliber: "-" });
    }
    return { ...input, lines };
  }

  async createGrn(branchId: string, rawInput: PurchaseGrnInput) {
    return this.prisma.tx(async (tx) => {
      const input = await this.resolveVariants(tx, rawInput);
      await this.validateGrn(tx, branchId, input);
      const date = input.date ?? new Date();
      const basis = (input.allocationBasis ?? (await this.settings.get<string>("grn.allocationBasis")) ?? "VALUE") as AllocationBasis;
      const number = await this.numbering.next(tx, branchId, "GRN", date);
      const grn = await tx.grn.create({
        data: { branchId, number, date, allocationBasis: basis, status: "DRAFT", ...this.grnData(input), ...stampCreate(), lines: { create: this.grnLines(input) } },
        include: { lines: true },
      });
      await this.audit.log({ entity: "grn", entityId: grn.id, action: "create", after: grn }, tx);
      return grn;
    });
  }

  async updateGrn(branchId: string, id: string, rawInput: PurchaseGrnInput) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.grn.findFirst({ where: { id, branchId, deletedAt: null }, include: { lines: true } });
      if (!before) throw new NotFoundException("GRN not found");
      if (before.status !== "DRAFT") throw new BadRequestException("Posted GRNs cannot be edited; cancel and re-enter");
      const input = await this.resolveVariants(tx, rawInput);
      await this.validateGrn(tx, branchId, input);
      await tx.grnLine.deleteMany({ where: { grnId: id } });
      const after = await tx.grn.update({
        where: { id },
        data: {
          ...this.grnData(input),
          date: input.date ?? before.date,
          ...(input.allocationBasis ? { allocationBasis: input.allocationBasis } : {}),
          ...stampUpdate(),
          lines: { create: this.grnLines(input) },
        },
        include: { lines: true },
      });
      await this.audit.log({ entity: "grn", entityId: id, action: "update", before, after }, tx);
      return after;
    });
  }

  /**
   * Post a GRN: tile lines must carry batch/shade/caliber/grade; landed cost (freight + unloading +
   * other charges) is allocated by value or weight and stored on each batch; good pieces go to
   * SALEABLE, damaged pieces to DAMAGED with a RECEIPT-stage breakage entry; PO received qty updates.
   */
  async postGrn(branchId: string, id: string) {
    return this.prisma.tx(async (tx) => {
      const grn = await tx.grn.findFirst({ where: { id, branchId, deletedAt: null }, include: { lines: { include: { product: true } } } });
      if (!grn) throw new NotFoundException("GRN not found");
      if (grn.status !== "DRAFT") throw new BadRequestException("This GRN is already posted or cancelled");
      if (!grn.lines.length) throw new BadRequestException("GRN has no lines");
      grn.lines.forEach((l, i) => {
        if (l.product.uomType === "PIECE_BOX_AREA" && (!l.batchNo || !l.shadeCode || !l.caliber)) {
          throw new BadRequestException(`Line ${i + 1} (${l.product.sku}): batch no, shade and caliber are required for tiles before stock can post`);
        }
      });

      const charges = Number(grn.freightPaise + grn.unloadingPaise + grn.otherChargesPaise);
      const alloc = allocateLandedCost(
        grn.lines.map((l) => ({
          qtyPcs: l.qtyPcs,
          ratePaise: Number(l.ratePaise),
          weightKg: l.product.weightPerBoxKg && l.product.pcsPerBox ? (l.product.weightPerBoxKg * l.qtyPcs) / l.product.pcsPerBox : null,
        })),
        charges,
        grn.allocationBasis,
      );

      const entries: LedgerEntry[] = [];
      let value = 0;
      for (const [i, l] of grn.lines.entries()) {
        const landed = alloc[i].landedRatePaise;
        let batchId: string;
        if (l.product.uomType === "PIECE_BOX_AREA") {
          const existing = await tx.batch.findUnique({ where: { productId_batchNo: { productId: l.productId, batchNo: l.batchNo } } });
          if (existing && (existing.shadeCode !== l.shadeCode || existing.caliber !== l.caliber || existing.grade !== l.grade)) {
            throw new BadRequestException(`Line ${i + 1}: batch ${l.batchNo} already exists with shade ${existing.shadeCode} / caliber ${existing.caliber} / ${existing.grade}`);
          }
          if (existing) {
            // weighted average landed cost with stock already on hand
            const onHand = await tx.stockBalance.aggregate({ where: { batchId: existing.id, stockType: { in: ["SALEABLE", "DISPLAY"] } }, _sum: { qtyPcs: true } });
            const have = Math.max(0, onHand._sum.qtyPcs ?? 0);
            const good = l.qtyPcs - l.damagedPcs;
            const avg = have + good > 0 ? Math.round((have * Number(existing.landedCostPaise) + good * landed) / (have + good)) : landed;
            await tx.batch.update({ where: { id: existing.id }, data: { purchaseRatePaise: l.ratePaise, landedCostPaise: BigInt(avg), ...stampUpdate() } });
            batchId = existing.id;
          } else {
            const b = await tx.batch.create({
              data: {
                productId: l.productId,
                batchNo: l.batchNo,
                shadeCode: l.shadeCode,
                caliber: l.caliber,
                grade: l.grade,
                purchaseRatePaise: l.ratePaise,
                landedCostPaise: BigInt(landed),
                supplierId: grn.supplierId,
                grnId: grn.id,
                ...stampCreate(),
              },
            });
            batchId = b.id;
          }
        } else if (l.batchNo.startsWith("V-")) {
          // colour variant lot for sanitary / CP items
          const variant = await tx.productVariant.findFirst({ where: { productId: l.productId, skuSuffix: l.batchNo.slice(2), deletedAt: null } });
          const b = await tx.batch.upsert({
            where: { productId_batchNo: { productId: l.productId, batchNo: l.batchNo } },
            create: {
              productId: l.productId,
              batchNo: l.batchNo,
              shadeCode: l.shadeCode || "-",
              caliber: "-",
              grade: "STANDARD",
              variantId: variant?.id ?? null,
              purchaseRatePaise: l.ratePaise,
              landedCostPaise: BigInt(landed),
              supplierId: grn.supplierId,
              grnId: grn.id,
              ...stampCreate(),
            },
            update: { purchaseRatePaise: l.ratePaise, landedCostPaise: BigInt(landed), variantId: variant?.id ?? undefined, ...stampUpdate() },
          });
          batchId = b.id;
        } else {
          const b = await this.ledger.defaultBatch(tx, l.productId);
          await tx.batch.update({ where: { id: b.id }, data: { purchaseRatePaise: l.ratePaise, landedCostPaise: BigInt(landed) } });
          batchId = b.id;
        }
        const amount = l.qtyPcs * Number(l.ratePaise);
        value += amount;
        await tx.grnLine.update({ where: { id: l.id }, data: { batchId, landedRatePaise: BigInt(landed), amountPaise: BigInt(amount) } });

        const common = { branchId, productId: l.productId, batchId, godownId: grn.godownId, rackId: l.rackId, refType: "GRN", refId: grn.id, refLineId: l.id, ratePaise: landed, postedAt: grn.date };
        const good = l.qtyPcs - l.damagedPcs;
        if (good > 0) entries.push({ ...common, qtyPcs: good, stockType: "SALEABLE" });
        if (l.damagedPcs > 0) {
          entries.push({ ...common, qtyPcs: l.damagedPcs, stockType: "DAMAGED", note: "Damaged on receipt" });
          const bkNo = await this.numbering.next(tx, branchId, "BREAKAGE", grn.date);
          await tx.breakageEntry.create({
            data: {
              branchId,
              number: bkNo,
              date: grn.date,
              stage: "RECEIPT",
              productId: l.productId,
              batchId,
              godownId: grn.godownId,
              rackId: l.rackId,
              qtyPcs: l.damagedPcs,
              reason: `Damaged on receipt (${grn.number})`,
              photos: [],
              status: "POSTED",
              refType: "GRN",
              refId: grn.id,
              ...stampCreate(),
            },
          });
        }
        if (l.poLineId) {
          await tx.purchaseOrderLine.update({ where: { id: l.poLineId }, data: { receivedPcs: { increment: l.qtyPcs } } });
        }
      }
      await this.ledger.post(tx, entries);

      if (grn.poId) await this.refreshPoStatus(tx, grn.poId);
      const after = await tx.grn.update({ where: { id }, data: { status: "POSTED", totalValuePaise: BigInt(value + charges), ...stampUpdate() } });
      await this.audit.log({ entity: "grn", entityId: id, action: "post", before: grn, after }, tx);
      return after;
    });
  }

  private async refreshPoStatus(tx: Tx, poId: string) {
    const lines = await tx.purchaseOrderLine.findMany({ where: { poId, deletedAt: null } });
    const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: poId } });
    if (["CANCELLED", "DRAFT"].includes(po.status)) return;
    const anyReceived = lines.some((l) => l.receivedPcs > 0);
    const allReceived = lines.every((l) => l.receivedPcs >= l.qtyPcs);
    const status = allReceived ? "COMPLETED" : anyReceived ? "PARTIAL" : "APPROVED";
    if (status !== po.status) await tx.purchaseOrder.update({ where: { id: poId }, data: { status } });
  }

  async cancelGrn(branchId: string, id: string) {
    return this.prisma.tx(async (tx) => {
      const grn = await tx.grn.findFirst({ where: { id, branchId, deletedAt: null }, include: { lines: true } });
      if (!grn) throw new NotFoundException("GRN not found");
      if (grn.status === "CANCELLED") throw new BadRequestException("Already cancelled");
      if (grn.status === "POSTED") {
        await reverseLedger(tx, this.ledger, "GRN", id, `Cancel ${grn.number}`);
        await tx.breakageEntry.updateMany({ where: { refType: "GRN", refId: id }, data: { status: "CANCELLED" } });
        for (const l of grn.lines) {
          if (l.poLineId) await tx.purchaseOrderLine.update({ where: { id: l.poLineId }, data: { receivedPcs: { decrement: l.qtyPcs } } });
        }
        if (grn.poId) await this.refreshPoStatus(tx, grn.poId);
      }
      const after = await tx.grn.update({ where: { id }, data: { status: "CANCELLED", ...stampUpdate() } });
      await this.audit.log({ entity: "grn", entityId: id, action: "cancel", before: grn, after }, tx);
      return after;
    });
  }

  // ------------------------------------------------------------------ purchase invoices

  listInvoices(branchId: string, q: ListQuery & { status?: string; supplierId?: string }) {
    return paginate(this.prisma.purchaseInvoice, q, {
      where: { branchId, deletedAt: null, ...statusFilter(q.status), ...(q.supplierId ? { supplierId: q.supplierId } : {}), ...searchWhere(q.q, ["number", "supplierInvoiceNo", "supplier.name"]) },
      include: docInclude,
      orderBy: { date: "desc" },
    });
  }

  async getInvoice(branchId: string, id: string) {
    const inv = await this.prisma.purchaseInvoice.findFirst({
      where: { id, branchId, deletedAt: null },
      include: { ...docInclude, lines: { include: { product: { select: { ...productUnitSelect, hsn: true } } } } },
    });
    if (!inv) throw new NotFoundException("Purchase invoice not found");
    return { ...inv, warnings: inv.varianceNotes ? inv.varianceNotes.split("; ") : [], lines: inv.lines.map((l) => ({ ...l, text: qtyText(l.qtyPcs, l.product) })) };
  }

  /** Quantity and rate variance against the PO and GRN (warnings only; posting is not blocked). */
  private async variances(tx: Tx, input: PurchaseInvoiceInput) {
    const warnings: string[] = [];
    const products = await tx.product.findMany({ where: { id: { in: input.lines.map((l) => l.productId) } }, select: { id: true, sku: true } });
    const sku = (id: string) => products.find((p) => p.id === id)?.sku ?? id;
    const invQty = new Map<string, number>();
    for (const l of input.lines) invQty.set(l.productId, (invQty.get(l.productId) ?? 0) + l.qtyPcs);
    if (input.poId) {
      const po = await tx.purchaseOrder.findFirst({ where: { id: input.poId }, include: { lines: true } });
      if (po) {
        for (const l of input.lines) {
          const pl = po.lines.find((x) => x.productId === l.productId);
          if (!pl) warnings.push(`${sku(l.productId)} is not on PO ${po.number}`);
          else if (Number(pl.ratePaise) !== l.ratePaise) warnings.push(`${sku(l.productId)}: rate ₹${(l.ratePaise / 100).toFixed(2)} differs from PO rate ₹${(Number(pl.ratePaise) / 100).toFixed(2)}`);
        }
        for (const [pid, qty] of invQty) {
          const ordered = po.lines.filter((x) => x.productId === pid).reduce((a, x) => a + x.qtyPcs, 0);
          if (ordered && qty > ordered) warnings.push(`${sku(pid)}: invoiced ${qty} pcs is more than ordered ${ordered} pcs`);
        }
      }
    }
    if (input.grnId) {
      const grn = await tx.grn.findFirst({ where: { id: input.grnId }, include: { lines: true } });
      if (grn) {
        if (grn.supplierId !== input.supplierId) warnings.push(`GRN ${grn.number} is from a different supplier`);
        for (const [pid, qty] of invQty) {
          const received = grn.lines.filter((x) => x.productId === pid).reduce((a, x) => a + x.qtyPcs, 0);
          if (qty !== received) warnings.push(`${sku(pid)}: invoiced ${qty} pcs but GRN ${grn.number} received ${received} pcs`);
        }
        for (const l of input.lines) {
          const gl = grn.lines.find((x) => x.productId === l.productId);
          if (gl && Number(gl.ratePaise) !== l.ratePaise) warnings.push(`${sku(l.productId)}: rate differs from GRN rate ₹${(Number(gl.ratePaise) / 100).toFixed(2)}`);
        }
      }
    }
    return warnings;
  }

  private async invoiceData(tx: Tx, branchId: string, input: PurchaseInvoiceInput) {
    const [branch, supplier] = await Promise.all([this.branch(tx, branchId), this.supplier(tx, input.supplierId)]);
    const inter = isInterState(branch.stateCode, supplier.stateCode);
    const totals = computeDocTotals(input.lines, inter, input.otherChargesPaise);
    const warnings = await this.variances(tx, input);
    const dueDate = input.dueDate ?? (supplier.creditDays ? new Date((input.date ?? new Date()).getTime() + supplier.creditDays * 86_400_000) : null);
    return {
      warnings,
      data: {
        supplierId: input.supplierId,
        supplierInvoiceNo: input.supplierInvoiceNo,
        poId: input.poId ?? null,
        grnId: input.grnId ?? null,
        placeOfSupply: branch.stateCode,
        isInterState: inter,
        taxablePaise: BigInt(totals.taxablePaise),
        cgstPaise: BigInt(totals.cgstPaise),
        sgstPaise: BigInt(totals.sgstPaise),
        igstPaise: BigInt(totals.igstPaise),
        otherChargesPaise: BigInt(input.otherChargesPaise),
        roundOffPaise: BigInt(totals.roundOffPaise),
        totalPaise: BigInt(totals.totalPaise),
        dueDate,
        varianceNotes: warnings.length ? warnings.join("; ") : null,
      },
      lines: input.lines.map((l, i) => ({
        productId: l.productId,
        qtyPcs: l.qtyPcs,
        ratePaise: BigInt(l.ratePaise),
        gstRate: l.gstRate,
        taxablePaise: BigInt(totals.lines[i].taxablePaise),
        taxPaise: BigInt(totals.lines[i].taxPaise),
        amountPaise: BigInt(totals.lines[i].amountPaise),
        ...stampCreate(),
      })),
    };
  }

  async createInvoice(branchId: string, input: PurchaseInvoiceInput) {
    return this.prisma.tx(async (tx) => {
      const dup = await tx.purchaseInvoice.findFirst({ where: { supplierId: input.supplierId, supplierInvoiceNo: input.supplierInvoiceNo, status: { not: "CANCELLED" }, deletedAt: null } });
      if (dup) throw new BadRequestException(`Supplier invoice ${input.supplierInvoiceNo} is already entered (${dup.number})`);
      const { data, lines, warnings } = await this.invoiceData(tx, branchId, input);
      const date = input.date ?? new Date();
      const number = await this.numbering.next(tx, branchId, "PURCHASE_INVOICE", date);
      const inv = await tx.purchaseInvoice.create({ data: { branchId, number, date, status: "DRAFT", ...data, ...stampCreate(), lines: { create: lines } }, include: { lines: true } });
      await this.audit.log({ entity: "purchase_invoice", entityId: inv.id, action: "create", after: inv }, tx);
      return { ...inv, warnings };
    });
  }

  async updateInvoice(branchId: string, id: string, input: PurchaseInvoiceInput) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.purchaseInvoice.findFirst({ where: { id, branchId, deletedAt: null }, include: { lines: true } });
      if (!before) throw new NotFoundException("Purchase invoice not found");
      if (before.status !== "DRAFT") throw new BadRequestException("Posted purchase invoices cannot be edited; cancel and re-enter");
      const { data, lines, warnings } = await this.invoiceData(tx, branchId, input);
      await tx.purchaseInvoiceLine.deleteMany({ where: { purchaseInvoiceId: id } });
      const after = await tx.purchaseInvoice.update({ where: { id }, data: { ...data, date: input.date ?? before.date, ...stampUpdate(), lines: { create: lines } }, include: { lines: true } });
      await this.audit.log({ entity: "purchase_invoice", entityId: id, action: "update", before, after }, tx);
      return { ...after, warnings };
    });
  }

  async postInvoice(branchId: string, id: string) {
    return this.prisma.tx(async (tx) => {
      const inv = await tx.purchaseInvoice.findFirst({ where: { id, branchId, deletedAt: null }, include: { lines: true } });
      if (!inv) throw new NotFoundException("Purchase invoice not found");
      if (inv.status !== "DRAFT") throw new BadRequestException("Only draft purchase invoices can be posted");
      const after = await tx.purchaseInvoice.update({ where: { id }, data: { status: "POSTED", syncStatus: "PENDING", ...stampUpdate() } });
      await this.tally.enqueueVoucher(tx, { entityType: "PURCHASE_INVOICE", entityId: id, branchId, partyId: inv.supplierId, productIds: [...new Set(inv.lines.map((l) => l.productId))] });
      await this.audit.log({ entity: "purchase_invoice", entityId: id, action: "post", before: inv, after }, tx);
      return after;
    });
  }

  async cancelInvoice(branchId: string, id: string) {
    return this.prisma.tx(async (tx) => {
      const inv = await tx.purchaseInvoice.findFirst({ where: { id, branchId, deletedAt: null } });
      if (!inv) throw new NotFoundException("Purchase invoice not found");
      if (inv.status === "CANCELLED") throw new BadRequestException("Already cancelled");
      if (inv.paidPaise > 0n) throw new BadRequestException("Payments are allocated to this invoice; reverse them first");
      const wasPosted = inv.status === "POSTED";
      const after = await tx.purchaseInvoice.update({ where: { id }, data: { status: "CANCELLED", ...(wasPosted ? { syncStatus: "PENDING" } : {}), ...stampUpdate() } });
      if (wasPosted) await this.tally.enqueue(tx, { entityType: "PURCHASE_INVOICE", entityId: id, branchId });
      await this.audit.log({ entity: "purchase_invoice", entityId: id, action: "cancel", before: inv, after }, tx);
      return after;
    });
  }

  // ------------------------------------------------------------------ debit notes / purchase returns

  listDebitNotes(branchId: string, q: ListQuery & { status?: string }) {
    return paginate(this.prisma.debitNote, q, {
      where: { branchId, deletedAt: null, ...statusFilter(q.status), ...searchWhere(q.q, ["number", "reason", "supplier.name"]) },
      include: { ...docInclude, _count: { select: { lines: true } } },
      orderBy: { date: "desc" },
    });
  }

  async getDebitNote(branchId: string, id: string) {
    const dn = await this.prisma.debitNote.findFirst({
      where: { id, branchId, deletedAt: null },
      include: { ...docInclude, lines: { include: { product: { select: productUnitSelect } } } },
    });
    if (!dn) throw new NotFoundException("Debit note not found");
    return { ...dn, lines: dn.lines.map((l) => ({ ...l, text: qtyText(l.qtyPcs, l.product) })) };
  }

  /** Debit note (posted immediately). Lines with a godown take the goods out of stock (purchase return). */
  async createDebitNote(branchId: string, input: PurchaseDebitNoteInput) {
    return this.prisma.tx(async (tx) => {
      const [branch, supplier] = await Promise.all([this.branch(tx, branchId), this.supplier(tx, input.supplierId)]);
      const inter = isInterState(branch.stateCode, supplier.stateCode);
      const date = input.date ?? new Date();
      const number = await this.numbering.next(tx, branchId, "DEBIT_NOTE", date);
      let taxable = 0;
      let tax = 0;
      const lines: (PurchaseDebitNoteInput["lines"][number] & { batchId: string | null; amountPaise: number })[] = [];
      for (const l of input.lines) {
        const c = computeLine({ qtyPcs: l.qtyPcs, ratePaise: l.ratePaise, gstRate: l.gstRate }, inter);
        taxable += c.taxablePaise;
        tax += c.taxPaise;
        let batchId = l.batchId ?? null;
        if (l.godownId) {
          await godownInBranch(tx, l.godownId, branchId);
          if (!batchId) batchId = (await this.ledger.defaultBatch(tx, l.productId)).id;
        }
        lines.push({ ...l, batchId, amountPaise: c.amountPaise });
      }
      const dn = await tx.debitNote.create({
        data: {
          branchId,
          number,
          date,
          supplierId: input.supplierId,
          purchaseInvoiceId: input.purchaseInvoiceId ?? null,
          grnId: input.grnId ?? null,
          reason: input.reason,
          taxablePaise: BigInt(taxable),
          taxPaise: BigInt(tax),
          totalPaise: BigInt(taxable + tax),
          status: "POSTED",
          syncStatus: "PENDING",
          ...stampCreate(),
          lines: {
            create: lines.map((l) => ({
              productId: l.productId,
              batchId: l.batchId,
              godownId: l.godownId ?? null,
              qtyPcs: l.qtyPcs,
              ratePaise: BigInt(l.ratePaise),
              gstRate: l.gstRate,
              amountPaise: BigInt(l.amountPaise),
              ...stampCreate(),
            })),
          },
        },
        include: { lines: true },
      });
      const entries: LedgerEntry[] = [];
      for (const [i, l] of dn.lines.entries()) {
        if (!l.godownId || !l.batchId) continue;
        entries.push(
          ...(await drawFromGodown(tx, {
            branchId,
            productId: l.productId,
            batchId: l.batchId,
            godownId: l.godownId,
            qtyPcs: l.qtyPcs,
            stockType: lines[i].fromStockType,
            refType: "DEBIT_NOTE",
            refId: dn.id,
            refLineId: l.id,
            ratePaise: l.ratePaise,
            note: input.reason,
            postedAt: date,
          })),
        );
      }
      await this.ledger.post(tx, entries);
      await this.tally.enqueueVoucher(tx, { entityType: "DEBIT_NOTE", entityId: dn.id, branchId, partyId: input.supplierId, productIds: [...new Set(dn.lines.map((l) => l.productId))] });
      await this.audit.log({ entity: "debit_note", entityId: dn.id, action: "post", after: dn }, tx);
      return dn;
    });
  }

  // ------------------------------------------------------------------ brand schemes

  listSchemes(q: ListQuery & { brandId?: string }) {
    return paginate(this.prisma.scheme, q, {
      where: { deletedAt: null, ...(q.brandId ? { brandId: q.brandId } : {}), ...searchWhere(q.q, ["name", "brand.name"]) },
      include: { brand: { select: { id: true, name: true } }, slabs: { orderBy: { threshold: "asc" } } },
      orderBy: { periodFrom: "desc" },
    });
  }

  async getScheme(id: string) {
    const s = await this.prisma.scheme.findFirst({
      where: { id, deletedAt: null },
      include: { brand: { select: { id: true, name: true } }, slabs: { orderBy: { threshold: "asc" } }, claims: { where: { deletedAt: null }, orderBy: { claimedAt: "desc" } } },
    });
    if (!s) throw new NotFoundException("Scheme not found");
    return { ...s, progress: await this.schemeProgress(s) };
  }

  async createScheme(input: PurchaseSchemeInput) {
    if (input.periodTo < input.periodFrom) throw new BadRequestException("Period end is before start");
    return this.prisma.tx(async (tx) => {
      const { slabs, ...rest } = input;
      const s = await tx.scheme.create({
        data: { ...rest, notes: rest.notes ?? null, ...stampCreate(), slabs: { create: slabs.map((x) => ({ threshold: BigInt(x.threshold), rebatePct: x.rebatePct, ...stampCreate() })) } },
        include: { slabs: true },
      });
      await this.audit.log({ entity: "scheme", entityId: s.id, action: "create", after: s }, tx);
      return s;
    });
  }

  async updateScheme(id: string, input: PurchaseSchemeInput) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.scheme.findFirst({ where: { id, deletedAt: null }, include: { slabs: true } });
      if (!before) throw new NotFoundException("Scheme not found");
      const { slabs, ...rest } = input;
      await tx.schemeSlab.deleteMany({ where: { schemeId: id } });
      const after = await tx.scheme.update({
        where: { id },
        data: { ...rest, notes: rest.notes ?? null, ...stampUpdate(), slabs: { create: slabs.map((x) => ({ threshold: BigInt(x.threshold), rebatePct: x.rebatePct, ...stampCreate() })) } },
        include: { slabs: true },
      });
      await this.audit.log({ entity: "scheme", entityId: id, action: "update", before, after }, tx);
      return after;
    });
  }

  async deleteScheme(id: string) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.scheme.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundException("Scheme not found");
      await tx.scheme.update({ where: { id }, data: { deletedAt: new Date(), ...stampUpdate() } });
      await this.audit.log({ entity: "scheme", entityId: id, action: "delete", before }, tx);
      return { ok: true };
    });
  }

  /** Achieved purchases of the scheme brand in its period (posted purchase invoices), slab and expected rebate. */
  async schemeProgress(s: { id: string; brandId: string; periodFrom: Date; periodTo: Date; targetType: string; slabs: { threshold: bigint; rebatePct: number }[] }) {
    const lines = await this.prisma.purchaseInvoiceLine.findMany({
      where: {
        deletedAt: null,
        product: { brandId: s.brandId },
        purchaseInvoice: { status: "POSTED", deletedAt: null, date: { gte: s.periodFrom, lte: new Date(s.periodTo.getTime() + 86_399_999) } },
      },
      include: { product: { select: { pcsPerBox: true, sqftPerBox: true } } },
    });
    const valuePaise = lines.reduce((a, l) => a + Number(l.taxablePaise), 0);
    const sqft = lines.reduce((a, l) => a + (l.product.pcsPerBox && l.product.sqftPerBox ? (l.qtyPcs * l.product.sqftPerBox) / l.product.pcsPerBox : 0), 0);
    const achieved = s.targetType === "SQFT" ? Math.floor(sqft) : valuePaise;
    const slabs = s.slabs.map((x) => ({ threshold: Number(x.threshold), rebatePct: x.rebatePct }));
    const { current, next } = schemeSlabFor(achieved, slabs);
    const expectedRebatePaise = current ? Math.round((valuePaise * current.rebatePct) / 100) : 0;
    const top = slabs.length ? Math.max(...slabs.map((x) => x.threshold)) : 0;
    return {
      achieved,
      achievedValuePaise: valuePaise,
      achievedSqft: Math.round(sqft * 10) / 10,
      currentSlab: current,
      nextSlab: next,
      toNextSlab: next ? next.threshold - achieved : 0,
      progressPct: top ? Math.min(100, Math.round((achieved / top) * 100)) : 0,
      expectedRebatePaise,
    };
  }

  async addClaim(id: string, input: { amountPaise: number; notes?: string | null }) {
    return this.prisma.tx(async (tx) => {
      const s = await tx.scheme.findFirst({ where: { id, deletedAt: null }, include: { slabs: true } });
      if (!s) throw new NotFoundException("Scheme not found");
      const progress = await this.schemeProgress(s);
      const claim = await tx.schemeClaim.create({
        data: { schemeId: id, amountPaise: BigInt(input.amountPaise), achievedValue: BigInt(progress.achieved), status: "POSTED", notes: input.notes ?? null, ...stampCreate() },
      });
      await this.audit.log({ entity: "scheme_claim", entityId: claim.id, action: "create", after: claim }, tx);
      return claim;
    });
  }
}

export type { Prisma };
