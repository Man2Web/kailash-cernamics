import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { formatQty, LABEL_BATCH_PREFIX, LABEL_RACK_PREFIX } from "@gc/shared";
import { PrismaService } from "../../../prisma/prisma.service";
import { emptyTotals, addToTotals, productUnitSelect, stripBatchCost } from "../stock-helpers";

const labelProduct = {
  id: true,
  sku: true,
  name: true,
  uomType: true,
  unitName: true,
  pcsPerBox: true,
  sqftPerBox: true,
  brand: { select: { name: true } },
  size: { select: { name: true } },
  finish: { select: { name: true } },
  color: { select: { name: true } },
} as const;

/** Box/rack labels with QR payloads, and the scan lookup that reads them back. */
@Injectable()
export class LabelsService {
  constructor(private readonly prisma: PrismaService) {}

  async batchLabels(q: { grnId?: string; productId?: string; batchIds?: string }) {
    let ids: string[] | undefined;
    if (q.grnId) {
      const lines = await this.prisma.grnLine.findMany({ where: { grnId: q.grnId, deletedAt: null, batchId: { not: null } }, select: { batchId: true, qtyPcs: true } });
      ids = lines.map((l) => l.batchId!);
    } else if (q.batchIds) {
      ids = q.batchIds.split(",").map((s) => s.trim()).filter(Boolean);
    }
    if (!ids && !q.productId) throw new BadRequestException("Choose a GRN, product or batches");
    const batches = await this.prisma.batch.findMany({
      where: { deletedAt: null, ...(ids ? { id: { in: ids } } : {}), ...(q.productId ? { productId: q.productId } : {}) },
      include: { product: { select: labelProduct } },
      orderBy: [{ product: { name: "asc" } }, { shadeCode: "asc" }],
      take: 500,
    });
    return batches.map((b) => ({
      batchId: b.id,
      qr: `${LABEL_BATCH_PREFIX}${b.id}`,
      sku: b.product.sku,
      name: b.product.name,
      brand: b.product.brand.name,
      size: b.product.size?.name ?? null,
      finish: b.product.finish?.name ?? null,
      color: b.product.color?.name ?? null,
      batchNo: b.batchNo,
      shadeCode: b.shadeCode,
      caliber: b.caliber,
      grade: b.grade,
      uomType: b.product.uomType,
      pcsPerBox: b.product.pcsPerBox,
      sqftPerBox: b.product.sqftPerBox,
    }));
  }

  async rackLabels(godownId: string) {
    if (!godownId) throw new BadRequestException("godownId is required");
    const racks = await this.prisma.rack.findMany({
      where: { godownId, deletedAt: null },
      include: { godown: { select: { name: true, code: true } } },
      orderBy: { code: "asc" },
    });
    return racks.map((r) => ({ rackId: r.id, qr: `${LABEL_RACK_PREFIX}${r.id}`, code: r.code, name: r.name, godown: r.godown.name, godownCode: r.godown.code }));
  }

  /** Resolve a scanned code: batch label, rack label, SKU or batch number. */
  async resolve(branchIds: string[], branchId: string, raw: string) {
    const code = raw.trim();
    if (!code) throw new BadRequestException("Nothing scanned");
    if (code.startsWith(LABEL_BATCH_PREFIX)) return this.batchCard(branchId, code.slice(LABEL_BATCH_PREFIX.length));
    if (code.startsWith(LABEL_RACK_PREFIX)) return this.rackCard(branchIds, code.slice(LABEL_RACK_PREFIX.length));
    const product = await this.prisma.product.findFirst({ where: { sku: { equals: code, mode: "insensitive" }, deletedAt: null }, select: { id: true } });
    if (product) return this.productCard(branchId, product.id);
    const batch = await this.prisma.batch.findFirst({ where: { batchNo: { equals: code, mode: "insensitive" }, deletedAt: null }, select: { id: true } });
    if (batch) return this.batchCard(branchId, batch.id);
    throw new NotFoundException(`Nothing found for "${code}"`);
  }

  private async batchCard(branchId: string, batchId: string) {
    const batch = await this.prisma.batch.findFirst({ where: { id: batchId, deletedAt: null }, include: { product: { select: productUnitSelect } } });
    if (!batch) throw new NotFoundException("Batch not found");
    const balances = await this.prisma.stockBalance.findMany({
      where: { batchId, branchId, qtyPcs: { not: 0 } },
      include: { godown: { select: { id: true, name: true } }, rack: { select: { id: true, code: true } } },
    });
    const totals = emptyTotals();
    for (const b of balances) addToTotals(totals, b.stockType, b.qtyPcs);
    const { product, ...rest } = batch;
    return {
      kind: "BATCH" as const,
      batch: stripBatchCost(rest),
      product,
      totals: { ...totals, availableText: formatQty(totals.available, product) },
      locations: balances.map((b) => ({ godown: b.godown, rack: b.rack, stockType: b.stockType, qtyPcs: b.qtyPcs, text: formatQty(b.qtyPcs, product) })),
    };
  }

  private async rackCard(branchIds: string[], rackId: string) {
    const rack = await this.prisma.rack.findFirst({ where: { id: rackId, deletedAt: null }, include: { godown: { select: { id: true, name: true, branchId: true } } } });
    if (!rack) throw new NotFoundException("Rack not found");
    if (!branchIds.includes(rack.godown.branchId)) throw new BadRequestException("This rack belongs to a branch you can't access");
    const balances = await this.prisma.stockBalance.findMany({
      where: { rackId, qtyPcs: { not: 0 } },
      include: { product: { select: productUnitSelect }, batch: { select: { id: true, batchNo: true, shadeCode: true, caliber: true, grade: true } } },
      orderBy: { product: { name: "asc" } },
    });
    return {
      kind: "RACK" as const,
      rack: { id: rack.id, code: rack.code, name: rack.name, godown: rack.godown },
      items: balances.map((b) => ({ product: b.product, batch: b.batch, stockType: b.stockType, qtyPcs: b.qtyPcs, text: formatQty(b.qtyPcs, b.product) })),
    };
  }

  private async productCard(branchId: string, productId: string) {
    const product = await this.prisma.product.findFirst({ where: { id: productId }, select: productUnitSelect });
    const balances = await this.prisma.stockBalance.findMany({
      where: { productId, branchId, qtyPcs: { not: 0 } },
      include: { batch: { select: { id: true, batchNo: true, shadeCode: true, caliber: true, grade: true } }, godown: { select: { name: true } }, rack: { select: { code: true } } },
    });
    const totals = emptyTotals();
    for (const b of balances) addToTotals(totals, b.stockType, b.qtyPcs);
    return {
      kind: "PRODUCT" as const,
      product,
      totals: { ...totals, availableText: formatQty(totals.available, product!) },
      locations: balances.map((b) => ({ batch: b.batch, godown: b.godown, rack: b.rack, stockType: b.stockType, qtyPcs: b.qtyPcs, text: formatQty(b.qtyPcs, product!) })),
    };
  }
}
