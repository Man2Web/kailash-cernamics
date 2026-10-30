import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  addDays,
  computeDocTotals,
  daysBetween,
  formatQty,
  isInterState,
  isOddLeftover,
  piecesForArea,
  piecesToSqft,
  rankLotsForRequirement,
  reorderSuggestion,
  sqftToSqmRounded,
  type LotFinderQuery,
  type ReorderPurchaseOrderInput,
  type ShadeStockQuery,
  type StockAnalysisGroup,
} from "@gc/shared";
import { PrismaService } from "../../../prisma/prisma.service";
import { AuditService } from "../../../core/audit.service";
import { NumberingService } from "../../../core/numbering.service";
import { stampCreate } from "../../../common/context";
import { canSeeCost } from "../stock-helpers";

type UnitSpec = { uomType: string; unitName: string | null; pcsPerBox: number | null; sqftPerBox: number | null; allowLooseSale?: boolean | null };

const productCard = {
  id: true,
  sku: true,
  name: true,
  uomType: true,
  unitName: true,
  pcsPerBox: true,
  sqftPerBox: true,
  allowLooseSale: true,
  weightPerBoxKg: true,
  images: true,
  applications: true,
  brand: { select: { id: true, name: true } },
  category: { select: { id: true, name: true, type: true } },
  series: { select: { id: true, name: true } },
  size: { select: { id: true, name: true } },
  finish: { select: { id: true, name: true } },
} satisfies Prisma.ProductSelect;

const batchCard = {
  id: true,
  batchNo: true,
  shadeCode: true,
  caliber: true,
  grade: true,
  productId: true,
  landedCostPaise: true,
  variant: { select: { id: true, skuSuffix: true, name: true } },
} satisfies Prisma.BatchSelect;

/** Outward sales movements (net of invoice cancellations) used for sales speed. */
const SALES_REF_TYPES = ["INVOICE", "INVOICE_CANCEL"];

function requiredPieces(q: { qty: number; unit: string; wastagePct: number }, p: UnitSpec): number {
  const tile = p.uomType === "PIECE_BOX_AREA" && p.pcsPerBox && p.sqftPerBox;
  if (q.unit === "SQFT") {
    if (!tile) throw new BadRequestException("Sq ft applies to tiles only; use units for this product");
    return piecesForArea(q.qty, q.wastagePct, { pcsPerBox: p.pcsPerBox, sqftPerBox: p.sqftPerBox, allowLooseSale: p.allowLooseSale });
  }
  if (q.unit === "BOXES") return Math.round(q.qty * (tile ? p.pcsPerBox! : 1));
  return Math.round(q.qty);
}

/**
 * Shade & lot control: which single lot can supply a whole requirement, shade-wise stock, what a
 * customer site received before, stock analysis by size/finish/application, and the reorder planner.
 */
@Injectable()
export class LotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
  ) {}

  /** Per-batch saleable/reserved/display/damaged in the branch, with per-godown availability. */
  private async batchStock(branchId: string, where: Prisma.StockBalanceWhereInput = {}) {
    const rows = await this.prisma.stockBalance.groupBy({
      by: ["productId", "batchId", "godownId", "stockType"],
      where: { branchId, ...where },
      _sum: { qtyPcs: true },
    });
    const map = new Map<
      string,
      { productId: string; batchId: string; saleable: number; reserved: number; display: number; damaged: number; inTransit: number; sample: number; godowns: Map<string, { saleable: number; reserved: number }> }
    >();
    for (const r of rows) {
      const qty = r._sum.qtyPcs ?? 0;
      if (!qty) continue;
      let b = map.get(r.batchId);
      if (!b) {
        b = { productId: r.productId, batchId: r.batchId, saleable: 0, reserved: 0, display: 0, damaged: 0, inTransit: 0, sample: 0, godowns: new Map() };
        map.set(r.batchId, b);
      }
      const g = b.godowns.get(r.godownId) ?? { saleable: 0, reserved: 0 };
      switch (r.stockType) {
        case "SALEABLE":
          b.saleable += qty;
          g.saleable += qty;
          break;
        case "RESERVED":
          b.reserved += qty;
          g.reserved += qty;
          break;
        case "DISPLAY":
          b.display += qty;
          break;
        case "DAMAGED":
          b.damaged += qty;
          break;
        case "IN_TRANSIT":
          b.inTransit += qty;
          break;
        case "SAMPLE":
          b.sample += qty;
          break;
      }
      b.godowns.set(r.godownId, g);
    }
    return map;
  }

  /** Days since each batch first came into stock (first inbound saleable ledger row). */
  private async batchAges(batchIds: string[]) {
    if (!batchIds.length) return new Map<string, { firstIn: Date; ageDays: number }>();
    const rows = await this.prisma.stockLedger.groupBy({
      by: ["batchId"],
      where: { batchId: { in: batchIds }, qtyPcs: { gt: 0 }, stockType: "SALEABLE" },
      _min: { postedAt: true },
    });
    return new Map(rows.filter((r) => r._min.postedAt).map((r) => [r.batchId, { firstIn: r._min.postedAt!, ageDays: daysBetween(r._min.postedAt!) }]));
  }

  private async godownNames(ids: string[]) {
    const rows = await this.prisma.godown.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, isDisplay: true } });
    return new Map(rows.map((g) => [g.id, g]));
  }

  // ---------------------------------------------------------------- lot finder

  async lotFinder(branchId: string, q: LotFinderQuery) {
    const product = await this.prisma.product.findFirst({ where: { id: q.productId, deletedAt: null }, select: { ...productCard, seriesId: true, sizeId: true, finishId: true } });
    if (!product) throw new NotFoundException("Product not found");
    const requiredPcs = requiredPieces(q, product);
    if (requiredPcs <= 0) throw new BadRequestException("Quantity is too small");

    const stock = await this.batchStock(branchId, { productId: product.id, stockType: { in: ["SALEABLE", "RESERVED"] } });
    const batchIds = [...stock.keys()];
    const [batches, ages] = await Promise.all([
      this.prisma.batch.findMany({ where: { id: { in: batchIds } }, select: batchCard }),
      this.batchAges(batchIds),
    ]);
    const godownIds = [...new Set([...stock.values()].flatMap((s) => [...s.godowns.keys()]))];
    const godowns = await this.godownNames(godownIds);

    // what this customer/site received last time (repeat orders must match the shade)
    let lastDelivery: null | {
      batchId: string | null;
      batchNo: string | null;
      shadeCode: string | null;
      caliber: string | null;
      invoiceId: string;
      invoiceNo: string | null;
      date: Date;
      qtyPcs: number;
      inStockPcs: number;
    } = null;
    if (q.partyId || q.siteId) {
      const line = await this.prisma.invoiceLine.findFirst({
        where: {
          productId: product.id,
          deletedAt: null,
          batchId: { not: null },
          invoice: { status: "POSTED", deletedAt: null, ...(q.siteId ? { siteId: q.siteId } : { partyId: q.partyId }) },
        },
        orderBy: { invoice: { date: "desc" } },
        include: { batch: { select: { batchNo: true, shadeCode: true, caliber: true } }, invoice: { select: { id: true, number: true, date: true } } },
      });
      if (line) {
        const s = line.batchId ? stock.get(line.batchId) : undefined;
        lastDelivery = {
          batchId: line.batchId,
          batchNo: line.batch?.batchNo ?? null,
          shadeCode: line.batch?.shadeCode ?? null,
          caliber: line.batch?.caliber ?? null,
          invoiceId: line.invoice.id,
          invoiceNo: line.invoice.number,
          date: line.invoice.date,
          qtyPcs: line.qtyPcs,
          inStockPcs: s ? s.saleable - s.reserved : 0,
        };
      }
    }

    const lots = batches.map((b) => {
      const s = stock.get(b.id)!;
      return { batchId: b.id, available: s.saleable - s.reserved, ageDays: ages.get(b.id)?.ageDays ?? 0, batch: b, stock: s };
    });
    const ranked = rankLotsForRequirement(lots, requiredPcs, product.pcsPerBox).map((o) => ({
      batchId: o.lot.batchId,
      batchNo: o.lot.batch.batchNo,
      shadeCode: o.lot.batch.shadeCode,
      caliber: o.lot.batch.caliber,
      grade: o.lot.batch.grade,
      variant: o.lot.batch.variant,
      availablePcs: o.lot.available,
      saleablePcs: o.lot.stock.saleable,
      reservedPcs: o.lot.stock.reserved,
      availableText: formatQty(o.lot.available, product),
      ageDays: o.lot.ageDays,
      fits: o.fits,
      shortPcs: o.shortPcs,
      shortText: o.shortPcs ? formatQty(o.shortPcs, product) : null,
      leftoverPcs: o.leftoverPcs,
      leftoverText: o.fits ? formatQty(o.leftoverPcs, product) : null,
      oddLeftover: o.fits && isOddLeftover(o.leftoverPcs, product.pcsPerBox),
      sameAsLastDelivery: !!lastDelivery?.batchId && lastDelivery.batchId === o.lot.batchId,
      godowns: [...o.lot.stock.godowns.entries()]
        .map(([godownId, g]) => ({ godownId, name: godowns.get(godownId)?.name ?? "", availablePcs: g.saleable - g.reserved }))
        .filter((g) => g.availablePcs > 0)
        .sort((a, b) => b.availablePcs - a.availablePcs),
    }));

    const totalAvailablePcs = ranked.reduce((a, l) => a + l.availablePcs, 0);
    const alternatives = ranked.some((l) => l.fits) && !lastDelivery ? [] : await this.alternatives(branchId, product, q);

    return {
      product,
      requiredPcs,
      requiredText: formatQty(requiredPcs, product),
      requiredSqft: piecesToSqft(requiredPcs, product),
      totalAvailablePcs,
      totalAvailableText: formatQty(totalAvailablePcs, product),
      fittingLots: ranked.filter((l) => l.fits).length,
      lots: ranked,
      lastDelivery: lastDelivery
        ? {
            ...lastDelivery,
            inStockText: formatQty(lastDelivery.inStockPcs, product),
            coversRequirement: lastDelivery.inStockPcs >= requiredPcs,
          }
        : null,
      alternatives,
    };
  }

  /** Same size and finish (same series first) with ONE lot that covers the requirement. */
  private async alternatives(
    branchId: string,
    product: { id: string; sizeId: string | null; finishId: string | null; seriesId: string | null; uomType: string },
    q: LotFinderQuery,
  ) {
    if (!product.sizeId) return [];
    const candidates = await this.prisma.product.findMany({
      where: { id: { not: product.id }, deletedAt: null, isActive: true, sizeId: product.sizeId, uomType: product.uomType as never, ...(product.finishId ? { finishId: product.finishId } : {}) },
      select: { ...productCard, seriesId: true },
      take: 60,
    });
    if (!candidates.length) return [];
    const stock = await this.batchStock(branchId, { productId: { in: candidates.map((c) => c.id) }, stockType: { in: ["SALEABLE", "RESERVED"] } });
    const batches = await this.prisma.batch.findMany({ where: { id: { in: [...stock.keys()] } }, select: batchCard });
    const ages = await this.batchAges(batches.map((b) => b.id));
    const out = [];
    for (const c of candidates) {
      let need: number;
      try {
        need = requiredPieces(q, c);
      } catch {
        continue;
      }
      const lots = batches
        .filter((b) => b.productId === c.id)
        .map((b) => {
          const s = stock.get(b.id)!;
          return { batchId: b.id, available: s.saleable - s.reserved, ageDays: ages.get(b.id)?.ageDays ?? 0, batch: b };
        });
      const best = rankLotsForRequirement(lots, need, c.pcsPerBox)[0];
      if (!best?.fits) continue;
      out.push({
        product: c,
        sameSeries: !!product.seriesId && c.seriesId === product.seriesId,
        requiredPcs: need,
        lot: {
          batchId: best.lot.batchId,
          batchNo: best.lot.batch.batchNo,
          shadeCode: best.lot.batch.shadeCode,
          caliber: best.lot.batch.caliber,
          grade: best.lot.batch.grade,
          availablePcs: best.lot.available,
          availableText: formatQty(best.lot.available, c),
          leftoverText: formatQty(best.leftoverPcs, c),
        },
      });
    }
    return out.sort((a, b) => Number(b.sameSeries) - Number(a.sameSeries) || b.lot.availablePcs - a.lot.availablePcs).slice(0, 8);
  }

  // ---------------------------------------------------------------- shade-wise stock

  async shades(branchId: string, q: ShadeStockQuery) {
    const productWhere: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(q.brandId ? { brandId: q.brandId } : {}),
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(q.sizeId ? { sizeId: q.sizeId } : {}),
      ...(q.finishId ? { finishId: q.finishId } : {}),
      ...(q.productId ? { id: q.productId } : {}),
    };
    const stock = await this.batchStock(branchId, { product: productWhere, ...(q.godownId ? { godownId: q.godownId } : {}) });
    const batchIds = [...stock.keys()];
    const [batches, ages, lastSold] = await Promise.all([
      this.prisma.batch.findMany({ where: { id: { in: batchIds } }, select: { ...batchCard, product: { select: productCard } } }),
      this.batchAges(batchIds),
      this.prisma.stockLedger.groupBy({
        by: ["batchId"],
        where: { batchId: { in: batchIds }, refType: "INVOICE", stockType: "SALEABLE", qtyPcs: { lt: 0 } },
        _max: { postedAt: true },
      }),
    ]);
    const lastSoldMap = new Map(lastSold.map((r) => [r.batchId, r._max.postedAt]));
    const cost = canSeeCost();
    const term = q.q?.toLowerCase();
    let rows = batches.map((b) => {
      const s = stock.get(b.id)!;
      const available = s.saleable - s.reserved;
      const { landedCostPaise, product, ...batch } = b;
      return {
        ...batch,
        product,
        availablePcs: available,
        saleablePcs: s.saleable,
        reservedPcs: s.reserved,
        displayPcs: s.display,
        damagedPcs: s.damaged,
        inTransitPcs: s.inTransit,
        samplePcs: s.sample,
        availableText: formatQty(available, product),
        sqft: piecesToSqft(available, product),
        ageDays: ages.get(b.id)?.ageDays ?? null,
        lastSoldAt: lastSoldMap.get(b.id) ?? null,
        ...(cost ? { landedCostPaise: Number(landedCostPaise), valuePaise: Number(landedCostPaise) * s.saleable } : {}),
      };
    });
    if (q.onlyAvailable) rows = rows.filter((r) => r.availablePcs > 0 || r.displayPcs > 0 || r.damagedPcs > 0);
    if (q.minAgeDays) rows = rows.filter((r) => (r.ageDays ?? 0) >= q.minAgeDays!);
    if (term) {
      rows = rows.filter((r) =>
        [r.product.sku, r.product.name, r.product.brand.name, r.batchNo, r.shadeCode, r.caliber, r.product.size?.name ?? ""].some((v) => v.toLowerCase().includes(term)),
      );
    }
    const dir = q.dir === "desc" ? -1 : 1;
    const key = q.sort ?? "product.name";
    const val = (r: (typeof rows)[number]): string | number => {
      switch (key) {
        case "ageDays":
          return r.ageDays ?? -1;
        case "availablePcs":
          return r.availablePcs;
        case "sqft":
          return r.sqft;
        case "lastSoldAt":
          return r.lastSoldAt ? new Date(r.lastSoldAt).getTime() : 0;
        case "shadeCode":
          return r.shadeCode;
        default:
          return `${r.product.name} ${r.shadeCode} ${r.batchNo}`;
      }
    };
    rows.sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 25;
    return { items: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize };
  }

  // ---------------------------------------------------------------- site history

  async siteHistory(q: { partyId?: string; siteId?: string; productId?: string }) {
    const lines = await this.prisma.invoiceLine.findMany({
      where: {
        deletedAt: null,
        ...(q.productId ? { productId: q.productId } : {}),
        invoice: { status: "POSTED", deletedAt: null, ...(q.siteId ? { siteId: q.siteId } : { partyId: q.partyId }) },
      },
      include: {
        product: { select: productCard },
        batch: { select: { id: true, batchNo: true, shadeCode: true, caliber: true, grade: true } },
        invoice: { select: { id: true, number: true, date: true, site: { select: { id: true, name: true } } } },
      },
      orderBy: { invoice: { date: "desc" } },
      take: 500,
    });
    const byProduct = new Map<string, { product: (typeof lines)[number]["product"]; deliveries: unknown[]; shades: Set<string>; totalPcs: number }>();
    for (const l of lines) {
      const g = byProduct.get(l.productId) ?? { product: l.product, deliveries: [], shades: new Set<string>(), totalPcs: 0 };
      g.deliveries.push({
        invoiceId: l.invoice.id,
        invoiceNo: l.invoice.number,
        date: l.invoice.date,
        site: l.invoice.site,
        batchId: l.batch?.id ?? null,
        batchNo: l.batch?.batchNo ?? null,
        shadeCode: l.batch?.shadeCode ?? null,
        caliber: l.batch?.caliber ?? null,
        qtyPcs: l.qtyPcs,
        qtyText: formatQty(l.qtyPcs, l.product),
      });
      if (l.batch && l.batch.shadeCode !== "-") g.shades.add(l.batch.shadeCode);
      g.totalPcs += l.qtyPcs;
      byProduct.set(l.productId, g);
    }
    return [...byProduct.values()].map((g) => ({
      product: g.product,
      shades: [...g.shades],
      mixedShades: g.shades.size > 1,
      totalPcs: g.totalPcs,
      totalText: formatQty(g.totalPcs, g.product),
      deliveries: g.deliveries,
    }));
  }

  // ---------------------------------------------------------------- analysis

  /** Net pieces sold per product in the last `days` (invoices minus cancellations). */
  private async soldPcs(branchId: string, days: number, productIds?: string[]) {
    const rows = await this.prisma.stockLedger.groupBy({
      by: ["productId"],
      where: {
        branchId,
        stockType: "SALEABLE",
        refType: { in: SALES_REF_TYPES },
        postedAt: { gte: addDays(new Date(), -days) },
        ...(productIds ? { productId: { in: productIds } } : {}),
      },
      _sum: { qtyPcs: true },
    });
    return new Map(rows.map((r) => [r.productId, Math.max(0, -(r._sum.qtyPcs ?? 0))]));
  }

  async analysis(branchId: string, groupBy: StockAnalysisGroup, filter: { categoryType?: string; brandId?: string }) {
    const productWhere: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(filter.brandId ? { brandId: filter.brandId } : {}),
      ...(filter.categoryType ? { category: { type: filter.categoryType as never } } : {}),
    };
    const balances = await this.prisma.stockBalance.groupBy({
      by: ["productId", "batchId", "godownId", "stockType"],
      where: { branchId, product: productWhere, stockType: { in: ["SALEABLE", "RESERVED"] } },
      _sum: { qtyPcs: true },
    });
    const productIds = [...new Set(balances.map((b) => b.productId))];
    const [products, batches, godowns, sold] = await Promise.all([
      this.prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, uomType: true, unitName: true, pcsPerBox: true, sqftPerBox: true, applications: true, brand: { select: { id: true, name: true } }, category: { select: { id: true, name: true } }, size: { select: { id: true, name: true } }, finish: { select: { id: true, name: true } } },
      }),
      this.prisma.batch.findMany({ where: { id: { in: [...new Set(balances.map((b) => b.batchId))] } }, select: { id: true, grade: true, landedCostPaise: true } }),
      this.godownNames([...new Set(balances.map((b) => b.godownId))]),
      this.soldPcs(branchId, 90, productIds),
    ]);
    const pmap = new Map(products.map((p) => [p.id, p]));
    const bmap = new Map(batches.map((b) => [b.id, b]));
    const cost = canSeeCost();

    type Acc = { key: string; label: string; products: Set<string>; saleablePcs: number; availablePcs: number; boxes: number; units: number; sqft: number; valuePaise: number; soldSqft: number; soldUnits: number };
    const groups = new Map<string, Acc>();
    const keysFor = (p: (typeof products)[number], b: { grade: string } | undefined, godownId: string): { key: string; label: string }[] => {
      switch (groupBy) {
        case "size":
          return [{ key: p.size?.id ?? "-", label: p.size?.name ?? (p.uomType === "UNIT" ? "Units (sanitary / CP)" : "No size") }];
        case "finish":
          return [{ key: p.finish?.id ?? "-", label: p.finish?.name ?? "No finish" }];
        case "application":
          return p.applications.length ? p.applications.map((a) => ({ key: a, label: a })) : [{ key: "-", label: "Not set" }];
        case "brand":
          return [{ key: p.brand.id, label: p.brand.name }];
        case "category":
          return [{ key: p.category.id, label: p.category.name }];
        case "godown":
          return [{ key: godownId, label: godowns.get(godownId)?.name ?? "Godown" }];
        case "grade":
          return [{ key: b?.grade ?? "-", label: b?.grade ?? "-" }];
      }
    };
    const soldCounted = new Set<string>();
    for (const r of balances) {
      const p = pmap.get(r.productId);
      if (!p) continue;
      const qty = r._sum.qtyPcs ?? 0;
      const b = bmap.get(r.batchId);
      for (const k of keysFor(p, b, r.godownId)) {
        const g = groups.get(k.key) ?? { ...k, products: new Set<string>(), saleablePcs: 0, availablePcs: 0, boxes: 0, units: 0, sqft: 0, valuePaise: 0, soldSqft: 0, soldUnits: 0 };
        g.products.add(p.id);
        const tile = p.uomType === "PIECE_BOX_AREA" && !!p.pcsPerBox;
        if (r.stockType === "SALEABLE") {
          g.saleablePcs += qty;
          g.valuePaise += qty * Number(b?.landedCostPaise ?? 0n);
        }
        const signed = r.stockType === "SALEABLE" ? qty : -qty;
        g.availablePcs += signed;
        if (tile) {
          g.boxes += signed / p.pcsPerBox!;
          g.sqft += piecesToSqft(signed, p);
        } else g.units += signed;
        // sales speed counts once per product per group (godown/grade split the same product)
        const soldKey = `${k.key}|${p.id}`;
        if (!soldCounted.has(soldKey)) {
          soldCounted.add(soldKey);
          const s = sold.get(p.id) ?? 0;
          if (tile) g.soldSqft += piecesToSqft(s, p);
          else g.soldUnits += s;
        }
        groups.set(k.key, g);
      }
    }
    const rows = [...groups.values()]
      .map((g) => {
        const dailySqft = g.soldSqft / 90;
        const dailyUnits = g.soldUnits / 90;
        const coverDays = dailySqft > 0 ? Math.round(g.sqft / dailySqft) : dailyUnits > 0 ? Math.round(g.units / dailyUnits) : null;
        return {
          key: g.key,
          label: g.label,
          products: g.products.size,
          availablePcs: g.availablePcs,
          boxes: Math.floor(g.boxes),
          units: g.units,
          sqft: Math.round(g.sqft * 10) / 10,
          sqm: sqftToSqmRounded(g.sqft),
          soldSqft90: Math.round(g.soldSqft * 10) / 10,
          soldUnits90: g.soldUnits,
          coverDays,
          ...(cost ? { valuePaise: g.valuePaise } : {}),
        };
      })
      .sort((a, b) => b.sqft - a.sqft || b.units - a.units);
    const totals = rows.reduce(
      (t, r) => ({ boxes: t.boxes + r.boxes, units: t.units + r.units, sqft: t.sqft + r.sqft, valuePaise: t.valuePaise + (r.valuePaise ?? 0) }),
      { boxes: 0, units: 0, sqft: 0, valuePaise: 0 },
    );
    return {
      groupBy,
      overlapping: groupBy === "application",
      rows,
      totals: { ...totals, sqft: Math.round(totals.sqft * 10) / 10, sqm: sqftToSqmRounded(totals.sqft), ...(cost ? {} : { valuePaise: undefined }) },
    };
  }

  // ---------------------------------------------------------------- reorder planner

  async reorder(branchId: string, q: { brandId?: string; windowDays: number; onlyNeeded: boolean; q?: string }) {
    const products = await this.prisma.product.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        ...(q.brandId ? { brandId: q.brandId } : {}),
        ...(q.q ? { OR: [{ sku: { contains: q.q, mode: "insensitive" } }, { name: { contains: q.q, mode: "insensitive" } }] } : {}),
      },
      select: { ...productCard, reorderLevelPcs: true, leadTimeDays: true, safetyStockDays: true, gstRate: true, brandId: true },
      orderBy: { name: "asc" },
    });
    const ids = products.map((p) => p.id);
    const [balances, sold, poLines, brands, lastBatches] = await Promise.all([
      this.prisma.stockBalance.groupBy({
        by: ["productId", "stockType"],
        where: { branchId, productId: { in: ids }, stockType: { in: ["SALEABLE", "RESERVED"] } },
        _sum: { qtyPcs: true },
      }),
      this.soldPcs(branchId, q.windowDays, ids),
      this.prisma.purchaseOrderLine.findMany({
        where: { productId: { in: ids }, deletedAt: null, po: { branchId, deletedAt: null, status: { notIn: ["CANCELLED", "COMPLETED"] } } },
        select: { productId: true, qtyPcs: true, receivedPcs: true },
      }),
      this.prisma.brand.findMany({ where: { id: { in: [...new Set(products.map((p) => p.brandId))] } }, select: { id: true, name: true, supplierId: true, leadTimeDays: true } }),
      this.prisma.batch.findMany({
        where: { productId: { in: ids }, purchaseRatePaise: { gt: 0 }, deletedAt: null },
        orderBy: { createdAt: "desc" },
        distinct: ["productId"],
        select: { productId: true, purchaseRatePaise: true },
      }),
    ]);
    const suppliers = await this.prisma.party.findMany({
      where: { id: { in: brands.map((b) => b.supplierId).filter((x): x is string => !!x) } },
      select: { id: true, name: true },
    });
    const avail = new Map<string, number>();
    for (const b of balances) avail.set(b.productId, (avail.get(b.productId) ?? 0) + (b.stockType === "SALEABLE" ? 1 : -1) * (b._sum.qtyPcs ?? 0));
    const onOrder = new Map<string, number>();
    for (const l of poLines) onOrder.set(l.productId, (onOrder.get(l.productId) ?? 0) + Math.max(0, l.qtyPcs - l.receivedPcs));
    const lastRate = new Map(lastBatches.map((b) => [b.productId, Number(b.purchaseRatePaise)]));
    const brandMap = new Map(brands.map((b) => [b.id, b]));
    const cost = canSeeCost();

    const groups = new Map<string, { brand: { id: string; name: string; leadTimeDays: number; supplier: { id: string; name: string } | null }; items: unknown[]; suggestedCount: number }>();
    for (const p of products) {
      const brand = brandMap.get(p.brandId)!;
      const leadTimeDays = p.leadTimeDays ?? brand.leadTimeDays;
      const availablePcs = avail.get(p.id) ?? 0;
      const onOrderPcs = onOrder.get(p.id) ?? 0;
      const soldPcs = sold.get(p.id) ?? 0;
      const r = reorderSuggestion({
        soldPcs,
        windowDays: q.windowDays,
        availablePcs,
        onOrderPcs,
        leadTimeDays,
        safetyStockDays: p.safetyStockDays,
        reorderLevelPcs: p.reorderLevelPcs,
        pcsPerBox: p.uomType === "PIECE_BOX_AREA" ? p.pcsPerBox : null,
      });
      if (q.onlyNeeded && r.suggestedPcs <= 0) continue;
      const g = groups.get(brand.id) ?? {
        brand: { id: brand.id, name: brand.name, leadTimeDays: brand.leadTimeDays, supplier: suppliers.find((s) => s.id === brand.supplierId) ?? null },
        items: [],
        suggestedCount: 0,
      };
      const { brandId: _b, gstRate: _g, ...card } = p;
      g.items.push({
        product: card,
        availablePcs,
        availableText: formatQty(availablePcs, p),
        onOrderPcs,
        onOrderText: formatQty(onOrderPcs, p),
        soldPcs,
        soldText: formatQty(soldPcs, p),
        dailyPcs: Math.round(r.dailyPcs * 100) / 100,
        coverDays: r.coverDays === null ? null : Math.round(r.coverDays),
        leadTimeDays,
        safetyStockDays: p.safetyStockDays,
        reorderLevelPcs: p.reorderLevelPcs,
        suggestedPcs: r.suggestedPcs,
        suggestedText: formatQty(r.suggestedPcs, p),
        reason: r.reason,
        ...(cost ? { lastRatePaise: lastRate.get(p.id) ?? null } : {}),
      });
      if (r.suggestedPcs > 0) g.suggestedCount++;
      groups.set(brand.id, g);
    }
    return [...groups.values()].sort((a, b) => b.suggestedCount - a.suggestedCount || a.brand.name.localeCompare(b.brand.name));
  }

  async createReorderPo(branchId: string, input: ReorderPurchaseOrderInput) {
    return this.prisma.tx(async (tx) => {
      const [branch, supplier] = await Promise.all([
        tx.branch.findUniqueOrThrow({ where: { id: branchId } }),
        tx.party.findFirst({ where: { id: input.supplierId, deletedAt: null, type: { in: ["SUPPLIER", "BOTH"] } } }),
      ]);
      if (!supplier) throw new BadRequestException("Supplier not found");
      const productIds = input.lines.map((l) => l.productId);
      if (new Set(productIds).size !== productIds.length) throw new BadRequestException("Each product can appear only once");
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, deletedAt: null },
        select: { id: true, gstRate: true, leadTimeDays: true, brand: { select: { id: true, leadTimeDays: true } } },
      });
      if (products.length !== productIds.length) throw new BadRequestException("Some products were not found");
      const rates = await tx.batch.findMany({
        where: { productId: { in: productIds }, purchaseRatePaise: { gt: 0 }, deletedAt: null },
        orderBy: { createdAt: "desc" },
        distinct: ["productId"],
        select: { productId: true, purchaseRatePaise: true },
      });
      const rateMap = new Map(rates.map((r) => [r.productId, Number(r.purchaseRatePaise)]));
      const pmap = new Map(products.map((p) => [p.id, p]));
      const lines = input.lines.map((l) => ({ productId: l.productId, qtyPcs: l.qtyPcs, ratePaise: rateMap.get(l.productId) ?? 0, gstRate: pmap.get(l.productId)!.gstRate }));
      const totals = computeDocTotals(lines, isInterState(branch.stateCode, supplier.stateCode));
      const lead = Math.max(...products.map((p) => p.leadTimeDays ?? p.brand.leadTimeDays));
      const date = new Date();
      const number = await this.numbering.next(tx, branchId, "PURCHASE_ORDER", date);
      const brandId = input.brandId ?? (new Set(products.map((p) => p.brand.id)).size === 1 ? products[0].brand.id : null);
      const po = await tx.purchaseOrder.create({
        data: {
          branchId,
          number,
          date,
          supplierId: supplier.id,
          brandId,
          expectedDate: addDays(date, lead),
          notes: input.notes || "Created from the reorder planner",
          totalPaise: BigInt(totals.totalPaise),
          status: "DRAFT",
          ...stampCreate(),
          lines: {
            create: lines.map((l, i) => ({
              productId: l.productId,
              qtyPcs: l.qtyPcs,
              ratePaise: BigInt(l.ratePaise),
              gstRate: l.gstRate,
              amountPaise: BigInt(totals.lines[i].taxablePaise),
              ...stampCreate(),
            })),
          },
        },
        include: { lines: true },
      });
      await this.audit.log({ entity: "purchase_order", entityId: po.id, action: "create_from_reorder", after: po }, tx);
      return { id: po.id, number: po.number, lines: po.lines.length, totalPaise: Number(po.totalPaise), ratesMissing: lines.filter((l) => !l.ratePaise).length };
    });
  }
}
