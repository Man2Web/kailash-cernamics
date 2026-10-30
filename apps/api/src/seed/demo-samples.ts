import type { Prisma, PrismaClient, StockType } from "@prisma/client";
import { DOC_PREFIX, DocType, financialYear, formatDocNo } from "@gc/shared";
import { balanceKey } from "../core/ledger.service";
import type { seedBase } from "./base";

type Base = Awaited<ReturnType<typeof seedBase>>;
type Db = PrismaClient | Prisma.TransactionClient;

interface Move {
  branchId: string;
  productId: string;
  batchId: string;
  godownId: string;
  rackId?: string | null;
  qtyPcs: number;
  stockType: StockType;
  refType: string;
  refId: string;
  refLineId?: string | null;
  note?: string;
  postedAt?: Date;
}

/** Same writes as LedgerService.post: a ledger row plus the materialised balance. */
async function post(db: Db, m: Move) {
  await db.stockLedger.create({
    data: { ...m, rackId: m.rackId ?? null, refLineId: m.refLineId ?? null, note: m.note ?? null, postedAt: m.postedAt ?? new Date() },
  });
  const key = balanceKey(m);
  await db.stockBalance.upsert({
    where: { key },
    create: { key, branchId: m.branchId, productId: m.productId, batchId: m.batchId, godownId: m.godownId, rackId: m.rackId ?? null, stockType: m.stockType, qtyPcs: m.qtyPcs },
    update: { qtyPcs: { increment: m.qtyPcs } },
  });
}

async function nextNo(db: Db, branchId: string, branchCode: string, docType: DocType, date: Date) {
  const fy = financialYear(date);
  const s = await db.numberSeries.upsert({
    where: { branchId_docType_fy: { branchId, docType, fy } },
    create: { branchId, docType, fy, prefix: DOC_PREFIX[docType], nextNo: 2 },
    update: { nextNo: { increment: 1 } },
  });
  return formatDocNo(s.prefix, branchCode, fy, s.nextNo - 1, s.padding);
}

/** Saleable lots in a godown with at least `min` pieces (largest first). */
async function saleableLots(db: Db, godownId: string, min: number, uomType: "PIECE_BOX_AREA" | "UNIT" = "PIECE_BOX_AREA") {
  return db.stockBalance.findMany({
    where: { godownId, stockType: "SALEABLE", qtyPcs: { gte: min }, product: { uomType } },
    include: { product: true, batch: true },
    orderBy: { qtyPcs: "desc" },
    take: 12,
  });
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

/** Demo data for sanitary colour lots, samples out, display boards and a supplier claim. Idempotent. */
export async function seedDemoSamples(prisma: PrismaClient, base: Base) {
  const branchId = base.branch.id;
  const main = base.mainGodown.id;
  const show = base.showroom.id;

  // 1. sanitary colour variants stocked as their own lots
  const wc = await prisma.product.findFirst({ where: { uomType: "UNIT", category: { type: "SANITARY" }, deletedAt: null }, orderBy: { sku: "asc" } });
  if (wc) {
    let variants = await prisma.productVariant.findMany({ where: { productId: wc.id, deletedAt: null }, include: { color: true } });
    if (!variants.length) {
      for (const [name, hex, suffix] of [["White", "#FFFFFF", "WH"], ["Ivory", "#F3EBD8", "IV"]] as const) {
        const color = await prisma.color.upsert({ where: { name }, create: { name, hex }, update: {} });
        await prisma.productVariant.create({ data: { productId: wc.id, colorId: color.id, skuSuffix: suffix, name: `${wc.name} – ${name}` } });
      }
      variants = await prisma.productVariant.findMany({ where: { productId: wc.id, deletedAt: null }, include: { color: true } });
    }
    const supplier = await prisma.party.findFirst({ where: { type: { in: ["SUPPLIER", "BOTH"] }, deletedAt: null } });
    for (const [i, v] of variants.entries()) {
      const batchNo = `V-${v.skuSuffix}`;
      if (await prisma.batch.findUnique({ where: { productId_batchNo: { productId: wc.id, batchNo } } })) continue;
      await prisma.$transaction(async (tx) => {
        const rate = Number(wc.mrpPaise) ? Math.round(Number(wc.mrpPaise) * 0.62) : 1_100_000;
        const b = await tx.batch.create({
          data: { productId: wc.id, batchNo, shadeCode: v.color?.name ?? v.skuSuffix, caliber: "-", variantId: v.id, purchaseRatePaise: BigInt(rate), landedCostPaise: BigInt(rate + 15000), supplierId: supplier?.id ?? null },
        });
        await post(tx, { branchId, productId: wc.id, batchId: b.id, godownId: main, qtyPcs: i === 0 ? 6 : 3, stockType: "SALEABLE", refType: "OPENING_STOCK", refId: b.id, note: "Demo colour lot", postedAt: daysAgo(20) });
      });
    }
  }

  // 2. samples out
  if ((await prisma.sampleIssue.count({ where: { branchId } })) === 0) {
    const lots = await saleableLots(prisma, main, 20);
    const people = [
      { name: "Ar. Priya Raghavan", phone: "9840011122", due: daysAgo(5), ret: 0, close: 0, influencer: true },
      { name: "Senthil (walk-in)", phone: "9894012345", due: new Date(Date.now() + 4 * 86_400_000), ret: 1, close: 0, influencer: false },
      { name: "Kumar Builders site office", phone: "9443055667", due: new Date(Date.now() + 10 * 86_400_000), ret: 0, close: 0, influencer: false },
    ];
    const influencer = await prisma.influencer.findFirst({ where: { type: "ARCHITECT", deletedAt: null } });
    const party = await prisma.party.findFirst({ where: { type: { in: ["CUSTOMER", "BOTH"] }, segment: "BUILDER", deletedAt: null } });
    for (const [i, p] of people.entries()) {
      const picks = lots.slice(i * 2, i * 2 + 2);
      if (!picks.length) break;
      await prisma.$transaction(async (tx) => {
        const date = daysAgo(12 - i * 3);
        const number = await nextNo(tx, branchId, base.branch.code, "SAMPLE_ISSUE", date);
        const issue = await tx.sampleIssue.create({
          data: {
            branchId,
            number,
            date,
            godownId: main,
            influencerId: p.influencer ? influencer?.id ?? null : null,
            partyId: i === 2 ? party?.id ?? null : null,
            issuedToName: p.influencer && influencer ? influencer.name : i === 2 && party ? party.name : p.name,
            phone: p.phone,
            expectedReturnDate: p.due,
            status: p.ret ? "PARTIAL" : "OPEN",
            lines: { create: picks.map((l) => ({ productId: l.productId, batchId: l.batchId, qtyPcs: 2, returnedPcs: p.ret })) },
          },
          include: { lines: true },
        });
        for (const [j, l] of issue.lines.entries()) {
          const bal = picks[j];
          await post(tx, { branchId, productId: l.productId, batchId: l.batchId, godownId: main, rackId: bal.rackId, qtyPcs: -2, stockType: "SALEABLE", refType: "SAMPLE_ISSUE", refId: issue.id, refLineId: l.id, postedAt: date });
          await post(tx, { branchId, productId: l.productId, batchId: l.batchId, godownId: main, qtyPcs: 2, stockType: "SAMPLE", refType: "SAMPLE_ISSUE", refId: issue.id, refLineId: l.id, postedAt: date });
          if (p.ret) {
            await post(tx, { branchId, productId: l.productId, batchId: l.batchId, godownId: main, qtyPcs: -p.ret, stockType: "SAMPLE", refType: "SAMPLE_RETURN", refId: issue.id, refLineId: l.id });
            await post(tx, { branchId, productId: l.productId, batchId: l.batchId, godownId: main, qtyPcs: p.ret, stockType: "SALEABLE", refType: "SAMPLE_RETURN", refId: issue.id, refLineId: l.id });
          }
        }
      });
    }
  }

  // 3. showroom display boards
  if ((await prisma.displayBoard.count({ where: { branchId } })) === 0) {
    const lots = await saleableLots(prisma, main, 24);
    const boards = [
      { code: "B1", name: "Living room floor bay", location: "Ground floor, entrance" },
      { code: "B2", name: "Bathroom wall panel", location: "First floor, left wall" },
    ];
    for (const [i, bd] of boards.entries()) {
      await prisma.$transaction(async (tx) => {
        const board = await tx.displayBoard.create({ data: { branchId, godownId: show, ...bd } });
        for (const l of lots.slice(i * 3, i * 3 + 3)) {
          const qty = l.product.pcsPerBox ? l.product.pcsPerBox : 4;
          const item = await tx.displayBoardItem.create({ data: { boardId: board.id, productId: l.productId, batchId: l.batchId, qtyPcs: qty, installedAt: daysAgo(30) } });
          await post(tx, { branchId, productId: l.productId, batchId: l.batchId, godownId: main, rackId: l.rackId, qtyPcs: -qty, stockType: "SALEABLE", refType: "DISPLAY_BOARD", refId: board.id, refLineId: item.id, postedAt: daysAgo(30) });
          await post(tx, { branchId, productId: l.productId, batchId: l.batchId, godownId: show, qtyPcs: qty, stockType: "DISPLAY", refType: "DISPLAY_BOARD", refId: board.id, refLineId: item.id, postedAt: daysAgo(30) });
        }
      });
    }
  }

  // 4. supplier breakage claim from receipt breakage
  if ((await prisma.breakageClaim.count({ where: { branchId } })) === 0) {
    const entries = await prisma.breakageEntry.findMany({
      where: { branchId, claimId: null, stage: { in: ["RECEIPT", "TRANSIT"] }, deletedAt: null, batch: { supplierId: { not: null } } },
      include: { batch: true },
    });
    const supplierId = entries[0]?.batch.supplierId;
    if (supplierId) {
      const mine = entries.filter((e) => e.batch.supplierId === supplierId);
      const claimed = mine.reduce((a, e) => a + e.qtyPcs * (Number(e.batch.landedCostPaise) || Number(e.batch.purchaseRatePaise)), 0);
      await prisma.$transaction(async (tx) => {
        const date = daysAgo(3);
        const number = await nextNo(tx, branchId, base.branch.code, "BREAKAGE_CLAIM", date);
        const claim = await tx.breakageClaim.create({ data: { branchId, number, date, supplierId, status: "SUBMITTED", claimedPaise: BigInt(claimed), notes: "Broken on unloading — photos shared with the distributor" } });
        await tx.breakageEntry.updateMany({ where: { id: { in: mine.map((e) => e.id) } }, data: { claimId: claim.id } });
      });
    }
  }
}
