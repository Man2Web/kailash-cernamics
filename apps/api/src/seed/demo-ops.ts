import type { PrismaClient, StockType } from "@prisma/client";
import { financialYear, formatDocNo } from "@gc/shared";
import type { seedBase } from "./base";
import { balanceKey } from "../core/ledger.service";

type Base = Awaited<ReturnType<typeof seedBase>>;

async function nextNo(prisma: PrismaClient, branch: { id: string; code: string }, docType: string, prefix: string) {
  const fy = financialYear(new Date());
  const s = await prisma.numberSeries.upsert({
    where: { branchId_docType_fy: { branchId: branch.id, docType, fy } },
    create: { branchId: branch.id, docType, fy, prefix, nextNo: 2 },
    update: { nextNo: { increment: 1 } },
  });
  return formatDocNo(s.prefix, branch.code, fy, s.nextNo - 1, s.padding);
}

/** Same rows LedgerService.post writes: a stock_ledger row plus the stock_balance upsert. */
async function post(
  prisma: PrismaClient,
  e: { branchId: string; productId: string; batchId: string; godownId: string; rackId: string | null; stockType: StockType; qtyPcs: number; refType: string; refId: string; refLineId?: string; note?: string },
) {
  await prisma.stockLedger.create({ data: { ...e, refLineId: e.refLineId ?? null, note: e.note ?? null } });
  const key = balanceKey(e);
  await prisma.stockBalance.upsert({
    where: { key },
    create: { key, branchId: e.branchId, productId: e.productId, batchId: e.batchId, godownId: e.godownId, rackId: e.rackId, stockType: e.stockType, qtyPcs: e.qtyPcs },
    update: { qtyPcs: { increment: e.qtyPcs } },
  });
}

/** Demo data for godown operations: a second branch, an in-transit transfer and a stock count in progress. */
export async function seedDemoOps(prisma: PrismaClient, base: Base) {
  const tpr = await prisma.branch.upsert({
    where: { code: "TPR" },
    create: { companyId: base.company.id, code: "TPR", name: "KAILAS CERAMIX - Tiruppur", city: "Tiruppur", state: "Tamil Nadu", stateCode: "33", tallyCompanyName: "Kailash Ceramics" },
    update: {},
  });
  const tprGodown = await prisma.godown.upsert({
    where: { branchId_code: { branchId: tpr.id, code: "MAIN" } },
    create: { branchId: tpr.id, code: "MAIN", name: "Tiruppur Godown" },
    update: {},
  });
  for (const code of ["T1", "T2"]) {
    await prisma.rack.upsert({ where: { godownId_code: { godownId: tprGodown.id, code } }, create: { godownId: tprGodown.id, code, name: `Rack ${code}` }, update: {} });
  }
  for (const email of ["manager@kailashceramics.com", "godown@kailashceramics.com"]) {
    const u = await prisma.user.findUnique({ where: { email } });
    if (u) await prisma.userBranch.upsert({ where: { userId_branchId: { userId: u.id, branchId: tpr.id } }, create: { userId: u.id, branchId: tpr.id }, update: {} });
  }

  // CBE → TPR transfer still in transit
  if (!(await prisma.stockTransfer.findFirst({ where: { toBranchId: tpr.id } }))) {
    const reserved = new Set((await prisma.stockBalance.findMany({ where: { stockType: "RESERVED", qtyPcs: { gt: 0 } }, select: { productId: true } })).map((r) => r.productId));
    const candidates = (
      await prisma.stockBalance.findMany({
        where: { branchId: base.branch.id, godownId: base.mainGodown.id, stockType: "SALEABLE", qtyPcs: { gte: 40 }, product: { uomType: "PIECE_BOX_AREA" } },
        include: { product: { select: { pcsPerBox: true } } },
        orderBy: { qtyPcs: "desc" },
        take: 10,
      })
    ).filter((b) => !reserved.has(b.productId)).slice(0, 2);
    if (candidates.length) {
      const number = await nextNo(prisma, base.branch, "TRANSFER", "ST");
      const doc = await prisma.stockTransfer.create({
        data: {
          branchId: base.branch.id,
          number,
          date: new Date(),
          fromGodownId: base.mainGodown.id,
          toGodownId: tprGodown.id,
          toBranchId: tpr.id,
          transitState: "IN_TRANSIT",
          status: "POSTED",
          vehicleNo: "TN 37 BK 4521",
          driverName: "Murugesan",
          notes: "Weekly stock top-up for Tiruppur",
          lines: {
            create: candidates.map((b) => ({ productId: b.productId, batchId: b.batchId, fromRackId: b.rackId, qtyPcs: (b.product.pcsPerBox ?? 1) * 4 })),
          },
        },
        include: { lines: true },
      });
      for (const l of doc.lines) {
        const common = { productId: l.productId, batchId: l.batchId, refType: "TRANSFER", refId: doc.id, refLineId: l.id, note: number };
        await post(prisma, { ...common, branchId: base.branch.id, godownId: base.mainGodown.id, rackId: l.fromRackId, stockType: "SALEABLE", qtyPcs: -l.qtyPcs });
        await post(prisma, { ...common, branchId: tpr.id, godownId: tprGodown.id, rackId: null, stockType: "IN_TRANSIT", qtyPcs: l.qtyPcs });
      }
      console.log(`demo-ops: transfer ${number} in transit to Tiruppur`);
    }
  }

  // a stock count in progress for one brand in the main godown
  if (!(await prisma.stockCount.findFirst({ where: { branchId: base.branch.id } }))) {
    const brand = await prisma.brand.findFirst({ where: { name: "Somany" } });
    const balances = await prisma.stockBalance.findMany({
      where: { branchId: base.branch.id, godownId: base.mainGodown.id, stockType: { in: ["SALEABLE", "DISPLAY"] }, qtyPcs: { gt: 0 }, ...(brand ? { product: { brandId: brand.id } } : {}) },
      take: 8,
    });
    if (balances.length) {
      const number = await nextNo(prisma, base.branch, "STOCK_COUNT", "PC");
      const doc = await prisma.stockCount.create({
        data: {
          branchId: base.branch.id,
          number,
          date: new Date(),
          godownId: base.mainGodown.id,
          brandId: brand?.id ?? null,
          blind: true,
          status: "COUNTING",
          notes: "Monthly Somany count",
          lines: { create: balances.map((b) => ({ productId: b.productId, batchId: b.batchId, rackId: b.rackId, stockType: b.stockType, systemPcs: b.qtyPcs })) },
        },
        include: { lines: true },
      });
      // first three lines counted; one is two pieces short
      for (const [i, l] of doc.lines.slice(0, 3).entries()) {
        const counted = i === 1 ? Math.max(0, l.systemPcs - 2) : l.systemPcs;
        await prisma.stockCountLine.update({ where: { id: l.id }, data: { countedPcs: counted, variancePcs: counted - l.systemPcs, countedAt: new Date() } });
      }
      console.log(`demo-ops: stock count ${number} in progress (${doc.lines.length} lines)`);
    }
  }
}
