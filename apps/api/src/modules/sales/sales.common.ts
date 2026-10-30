import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import type { Product, Segment } from "@prisma/client";
import { isInterState, roundUpToBox, salesDefaultBasis, type SalesProductSpec } from "@gc/shared";
import type { PrismaService, Tx } from "../../prisma/prisma.service";
import type { LedgerService } from "../../core/ledger.service";
import { searchWhere } from "../../common/pagination";

export type Db = Tx | PrismaService;

export const productInclude = {
  brand: { select: { id: true, name: true } },
  size: { select: { id: true, name: true } },
  category: { select: { id: true, name: true, type: true } },
} as const;

export function spec(p: Product): SalesProductSpec {
  return { uomType: p.uomType, pcsPerBox: p.pcsPerBox, sqftPerBox: p.sqftPerBox, allowLooseSale: p.allowLooseSale, gstRate: p.gstRate };
}

export async function loadProducts(db: Db, ids: string[]): Promise<Map<string, Product>> {
  const unique = [...new Set(ids)];
  const rows = await db.product.findMany({ where: { id: { in: unique }, deletedAt: null } });
  const map = new Map(rows.map((p) => [p.id, p]));
  for (const id of unique) if (!map.has(id)) throw new BadRequestException("A product on this document no longer exists");
  return map;
}

/** Tiles sold without loose-sale are rounded up to full boxes. */
export function normaliseQty(p: Product, qtyPcs: number): number {
  if (p.uomType === "PIECE_BOX_AREA" && !p.allowLooseSale && p.pcsPerBox) return roundUpToBox(qtyPcs, p.pcsPerBox);
  return qtyPcs;
}

/** Branch, party and place of supply → CGST/SGST or IGST. */
export async function resolvePlace(db: Db, branchId: string, partyId?: string | null, explicit?: string | null) {
  const branch = await db.branch.findUnique({ where: { id: branchId } });
  if (!branch) throw new NotFoundException("Branch not found");
  const party = partyId ? await db.party.findFirst({ where: { id: partyId, deletedAt: null } }) : null;
  if (partyId && !party) throw new BadRequestException("Customer not found");
  const placeOfSupply = explicit || party?.stateCode || branch.stateCode;
  return { branch, party, placeOfSupply, interState: isInterState(branch.stateCode, placeOfSupply) };
}

/** Price from the customer's segment price list (latest valid), then RETAIL, then MRP. */
export async function priceFor(db: Db, productId: string, segment: Segment = "RETAIL") {
  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) throw new NotFoundException("Product not found");
  for (const seg of segment === "RETAIL" ? ["RETAIL"] : [segment, "RETAIL"]) {
    const item = await db.priceListItem.findFirst({
      where: { productId, deletedAt: null, validFrom: { lte: new Date() }, priceList: { segment: seg as Segment, isActive: true, deletedAt: null } },
      orderBy: { validFrom: "desc" },
      include: { priceList: { select: { name: true } } },
    });
    if (item) return { priceBasis: item.priceBasis, pricePaise: Number(item.pricePaise), source: item.priceList.name };
  }
  const basis = product.uomType === "PIECE_BOX_AREA" ? "PER_BOX" : salesDefaultBasis(product);
  return { priceBasis: basis, pricePaise: Number(product.mrpPaise), source: "MRP" };
}

/** List filters shared by every sales document: status, party, date range, search by number/party. */
export function docWhere(q: Record<string, any>, branchId: string, numberField = "number") {
  const where: Record<string, unknown> = { branchId, deletedAt: null };
  if (q.status) where.status = q.status;
  if (q.partyId) where.partyId = q.partyId;
  if (q.from || q.to) where.date = { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(`${q.to}T23:59:59.999+05:30`) } : {}) };
  Object.assign(where, searchWhere(q.q, [numberField, "party.name"]));
  return where;
}

export interface BatchPick {
  batchId: string;
  godownId: string;
}

/**
 * Pick ONE batch (and godown) that can supply the whole quantity, or verify the given one.
 * Throws 409 BATCH_SHORT with per-batch availability so the UI can offer a split.
 */
export async function pickBatch(
  tx: Tx,
  ledger: LedgerService,
  p: Product,
  qtyPcs: number,
  branchId: string,
  want: { batchId?: string | null; godownId?: string | null },
  lineRef?: string,
): Promise<BatchPick> {
  let batchId = want.batchId ?? null;
  if (!batchId && p.uomType !== "PIECE_BOX_AREA") batchId = (await ledger.defaultBatch(tx, p.id)).id;
  const rows = await ledger.batchAvailability(tx, p.id, branchId);
  const candidates = rows.filter((r) => (!batchId || r.batchId === batchId) && (!want.godownId || r.godownId === want.godownId));
  const fit = candidates.filter((r) => r.available >= qtyPcs).sort((a, b) => b.available - a.available)[0];
  if (fit) return { batchId: fit.batchId, godownId: fit.godownId };
  throw new ConflictException({
    message: `Not enough stock of ${p.sku} in a single ${p.uomType === "PIECE_BOX_AREA" ? "batch/shade" : "godown"} for ${qtyPcs} pcs. Split the line across batches or pick another product.`,
    code: "BATCH_SHORT",
    productId: p.id,
    lineRef,
    qtyPcs,
    batches: rows.map((r) => ({
      batchId: r.batchId,
      godownId: r.godownId,
      available: r.available,
      saleable: r.saleable,
      reserved: r.reserved,
      batchNo: r.batch?.batchNo,
      shadeCode: r.batch?.shadeCode,
      caliber: r.batch?.caliber,
      grade: r.batch?.grade,
      godownName: r.godown?.name,
    })),
  });
}

export function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * 86_400_000);
}
