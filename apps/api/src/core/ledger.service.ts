import { BadRequestException, Injectable } from "@nestjs/common";
import { StockType } from "@prisma/client";
import { formatBoxes } from "@gc/shared";
import { PrismaService, Tx } from "../prisma/prisma.service";
import { currentUserId } from "../common/context";

export interface LedgerEntry {
  branchId: string;
  productId: string;
  batchId: string;
  godownId: string;
  rackId?: string | null;
  /** signed piece count: + into stock, - out of stock */
  qtyPcs: number;
  stockType: StockType;
  refType: string;
  refId: string;
  refLineId?: string | null;
  ratePaise?: number | bigint;
  note?: string | null;
  postedAt?: Date;
}

export function balanceKey(e: { productId: string; batchId: string; godownId: string; rackId?: string | null; stockType: string }) {
  return `${e.productId}|${e.batchId}|${e.godownId}|${e.rackId ?? "-"}|${e.stockType}`;
}

/**
 * The ONLY code that changes stock. Inserts stock_ledger rows and maintains stock_balance in the
 * caller's transaction. Balances can't go negative (the upsert row lock serialises concurrent posts).
 */
@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async post(tx: Tx, entries: LedgerEntry[], opts: { allowNegative?: boolean } = {}) {
    for (const e of entries) {
      if (!Number.isInteger(e.qtyPcs) || e.qtyPcs === 0) continue;
      // Taking stock out of a godown without naming a rack (billing, dispatch): use the unracked
      // balance first, then draw from the racks that hold this batch, largest first.
      const parts = e.qtyPcs < 0 && !e.rackId ? await this.splitAcrossRacks(tx, e) : [e];
      for (const p of parts) await this.postOne(tx, p, opts);
    }
  }

  private async splitAcrossRacks(tx: Tx, e: LedgerEntry): Promise<LedgerEntry[]> {
    const balances = await tx.stockBalance.findMany({
      where: { productId: e.productId, batchId: e.batchId, godownId: e.godownId, stockType: e.stockType, qtyPcs: { gt: 0 } },
      orderBy: { qtyPcs: "desc" },
    });
    let need = -e.qtyPcs;
    const out: LedgerEntry[] = [];
    const unracked = balances.find((b) => !b.rackId);
    for (const b of unracked ? [unracked, ...balances.filter((x) => x !== unracked)] : balances) {
      if (need <= 0) break;
      const take = Math.min(need, b.qtyPcs);
      out.push({ ...e, rackId: b.rackId, qtyPcs: -take });
      need -= take;
    }
    // whatever is left goes against the unracked balance; post() rejects it if that goes negative
    if (need > 0) out.push({ ...e, rackId: null, qtyPcs: -need });
    return out;
  }

  private async postOne(tx: Tx, e: LedgerEntry, opts: { allowNegative?: boolean }) {
    {
      await tx.stockLedger.create({
        data: {
          branchId: e.branchId,
          productId: e.productId,
          batchId: e.batchId,
          godownId: e.godownId,
          rackId: e.rackId ?? null,
          qtyPcs: e.qtyPcs,
          stockType: e.stockType,
          refType: e.refType,
          refId: e.refId,
          refLineId: e.refLineId ?? null,
          ratePaise: BigInt(e.ratePaise ?? 0),
          note: e.note ?? null,
          postedAt: e.postedAt ?? new Date(),
          createdBy: currentUserId(),
        },
      });
      const key = balanceKey(e);
      const bal = await tx.stockBalance.upsert({
        where: { key },
        create: {
          key,
          branchId: e.branchId,
          productId: e.productId,
          batchId: e.batchId,
          godownId: e.godownId,
          rackId: e.rackId ?? null,
          stockType: e.stockType,
          qtyPcs: e.qtyPcs,
        },
        update: { qtyPcs: { increment: e.qtyPcs } },
        include: { product: { select: { sku: true, name: true, pcsPerBox: true } }, batch: { select: { batchNo: true, shadeCode: true } } },
      });
      if (bal.qtyPcs < 0 && !opts.allowNegative) {
        const short = formatBoxes(-bal.qtyPcs, bal.product.pcsPerBox);
        throw new BadRequestException(
          `Not enough ${e.stockType.toLowerCase()} stock for ${bal.product.sku} (batch ${bal.batch.batchNo}, shade ${bal.batch.shadeCode}): short by ${short}`,
        );
      }
    }
  }

  /** Move stock between godowns/racks/stock types: one negative and one positive ledger row. */
  async move(
    tx: Tx,
    m: Omit<LedgerEntry, "godownId" | "rackId" | "stockType" | "qtyPcs"> & {
      qtyPcs: number;
      from: { godownId: string; rackId?: string | null; stockType: StockType };
      to: { godownId: string; rackId?: string | null; stockType: StockType };
    },
  ) {
    const base = { ...m } as Partial<typeof m>;
    delete base.from;
    delete base.to;
    await this.post(tx, [
      { ...(base as LedgerEntry), ...m.from, qtyPcs: -Math.abs(m.qtyPcs) },
      { ...(base as LedgerEntry), ...m.to, qtyPcs: Math.abs(m.qtyPcs) },
    ]);
  }

  /** Available = SALEABLE − RESERVED, optionally per batch / godown. */
  async available(db: Tx | PrismaService, productId: string, filter: { batchId?: string; godownId?: string; branchId?: string } = {}) {
    const rows = await db.stockBalance.groupBy({
      by: ["stockType"],
      where: { productId, ...filter, stockType: { in: ["SALEABLE", "RESERVED"] } },
      _sum: { qtyPcs: true },
    });
    const get = (t: string) => rows.find((r) => r.stockType === t)?._sum.qtyPcs ?? 0;
    return get("SALEABLE") - get("RESERVED");
  }

  /** Per-batch availability for a product (shade picker / split dialog). */
  async batchAvailability(db: Tx | PrismaService, productId: string, branchId?: string) {
    const rows = await db.stockBalance.groupBy({
      by: ["batchId", "godownId", "stockType"],
      where: { productId, ...(branchId ? { branchId } : {}), stockType: { in: ["SALEABLE", "RESERVED"] } },
      _sum: { qtyPcs: true },
    });
    const map = new Map<string, { batchId: string; godownId: string; saleable: number; reserved: number }>();
    for (const r of rows) {
      const k = `${r.batchId}|${r.godownId}`;
      const cur = map.get(k) ?? { batchId: r.batchId, godownId: r.godownId, saleable: 0, reserved: 0 };
      if (r.stockType === "SALEABLE") cur.saleable += r._sum.qtyPcs ?? 0;
      else cur.reserved += r._sum.qtyPcs ?? 0;
      map.set(k, cur);
    }
    const batches = await db.batch.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.batchId))] } } });
    const godowns = await db.godown.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.godownId))] } } });
    return [...map.values()]
      .map((v) => ({
        ...v,
        available: v.saleable - v.reserved,
        batch: batches.find((b) => b.id === v.batchId)!,
        godown: godowns.find((g) => g.id === v.godownId)!,
      }))
      .filter((v) => v.saleable !== 0 || v.reserved !== 0)
      .sort((a, b) => b.available - a.available);
  }

  /** Sanitary / CP / accessory items have no shade lots; they use one default batch per product. */
  async defaultBatch(tx: Tx, productId: string) {
    return tx.batch.upsert({
      where: { productId_batchNo: { productId, batchNo: "DEFAULT" } },
      create: { productId, batchNo: "DEFAULT", shadeCode: "-", caliber: "-", grade: "STANDARD" },
      update: {},
    });
  }
}
