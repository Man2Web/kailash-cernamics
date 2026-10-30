import { BadRequestException, NotFoundException } from "@nestjs/common";
import { StockType } from "@prisma/client";
import { formatQty } from "@gc/shared";
import { PrismaService, Tx } from "../../prisma/prisma.service";
import { ctx } from "../../common/context";
import { LedgerEntry, LedgerService } from "../../core/ledger.service";

export function canSeeCost(): boolean {
  return !!ctx().user?.permissions.has("cost.read");
}

/** Remove cost fields (purchase/landed rates) for users without cost.read. */
export function stripBatchCost<T extends Record<string, any> | null | undefined>(b: T): T {
  if (!b || canSeeCost()) return b;
  const { purchaseRatePaise: _p, landedCostPaise: _l, ...rest } = b as Record<string, any>;
  return rest as T;
}

export async function godownInBranch(db: Tx | PrismaService, godownId: string, branchId: string) {
  const g = await db.godown.findFirst({ where: { id: godownId, deletedAt: null } });
  if (!g) throw new NotFoundException("Godown not found");
  if (g.branchId !== branchId) throw new BadRequestException(`Godown ${g.name} belongs to another branch`);
  return g;
}

export async function rackInGodown(db: Tx | PrismaService, rackId: string | null | undefined, godownId: string) {
  if (!rackId) return null;
  const r = await db.rack.findFirst({ where: { id: rackId, deletedAt: null } });
  if (!r || r.godownId !== godownId) throw new BadRequestException("Rack does not belong to the selected godown");
  return r;
}

/** Reverse every ledger row of a document (used when a posted document is cancelled). */
export async function reverseLedger(tx: Tx, ledger: LedgerService, refType: string, refId: string, note: string) {
  const rows = await tx.stockLedger.findMany({ where: { refType, refId } });
  if (!rows.length) return;
  const entries: LedgerEntry[] = rows.map((r) => ({
    branchId: r.branchId,
    productId: r.productId,
    batchId: r.batchId,
    godownId: r.godownId,
    rackId: r.rackId,
    qtyPcs: -r.qtyPcs,
    stockType: r.stockType as StockType,
    refType: `${refType}_CANCEL`,
    refId,
    refLineId: r.refLineId,
    ratePaise: r.ratePaise,
    note,
  }));
  // Take stock out first so a cancel never leaves a negative intermediate balance.
  entries.sort((a, b) => a.qtyPcs - b.qtyPcs);
  await ledger.post(tx, entries);
}

export interface QtyTotals {
  saleable: number;
  reserved: number;
  display: number;
  damaged: number;
  /** inter-branch transfer on the way to this branch */
  inTransit: number;
  /** sample pieces out with customers/architects */
  sample: number;
  available: number;
}

export function emptyTotals(): QtyTotals {
  return { saleable: 0, reserved: 0, display: 0, damaged: 0, inTransit: 0, sample: 0, available: 0 };
}

export function addToTotals(t: QtyTotals, stockType: string, qty: number) {
  if (stockType === "SALEABLE") t.saleable += qty;
  else if (stockType === "RESERVED") t.reserved += qty;
  else if (stockType === "DISPLAY") t.display += qty;
  else if (stockType === "DAMAGED") t.damaged += qty;
  else if (stockType === "IN_TRANSIT") t.inTransit += qty;
  else if (stockType === "SAMPLE") t.sample += qty;
  t.available = t.saleable - t.reserved;
}

export const productUnitSelect = {
  id: true,
  sku: true,
  name: true,
  uomType: true,
  unitName: true,
  pcsPerBox: true,
  sqftPerBox: true,
  weightPerBoxKg: true,
  reorderLevelPcs: true,
  images: true,
  brand: { select: { id: true, name: true } },
  category: { select: { id: true, name: true, type: true } },
  size: { select: { id: true, name: true } },
} as const;

export function qtyText(pcs: number, p: { uomType: string; unitName: string | null; pcsPerBox: number | null; sqftPerBox: number | null }) {
  return formatQty(pcs, p);
}

/**
 * Ledger entries that take `qtyPcs` out of a godown for a batch, drawing from whichever racks hold
 * it (largest first). If there is not enough, the remainder is posted unracked so the ledger
 * service rejects it with a clear "not enough stock" message.
 */
export async function drawFromGodown(
  tx: Tx,
  e: Omit<LedgerEntry, "qtyPcs" | "rackId"> & { qtyPcs: number },
): Promise<LedgerEntry[]> {
  const balances = await tx.stockBalance.findMany({
    where: { productId: e.productId, batchId: e.batchId, godownId: e.godownId, stockType: e.stockType, qtyPcs: { gt: 0 } },
    orderBy: { qtyPcs: "desc" },
  });
  let left = Math.abs(e.qtyPcs);
  const out: LedgerEntry[] = [];
  for (const b of balances) {
    if (left <= 0) break;
    const take = Math.min(left, b.qtyPcs);
    out.push({ ...e, rackId: b.rackId, qtyPcs: -take });
    left -= take;
  }
  if (left > 0) out.push({ ...e, rackId: null, qtyPcs: -left });
  return out;
}
