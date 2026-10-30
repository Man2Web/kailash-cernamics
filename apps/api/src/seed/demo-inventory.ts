import type { Prisma, PrismaClient, Product } from "@prisma/client";
import { allocateLandedCost, computeDocTotals, isInterState } from "@gc/shared";
import type { seedBase } from "./base";
import { balanceKey } from "../core/ledger.service";
import { NumberingService } from "../core/numbering.service";
import { TallyQueueService } from "../core/tally-queue.service";

type Base = Awaited<ReturnType<typeof seedBase>>;
type Tx = Prisma.TransactionClient;

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const numbering = new NumberingService();
const tally = new TallyQueueService();

/** Deterministic 0..1 from a string, so the demo data is the same on every machine. */
function rand(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

/** Same writes as LedgerService.post: a stock_ledger row + stock_balance upsert (never negative). */
async function ledger(
  tx: Tx,
  e: { branchId: string; productId: string; batchId: string; godownId: string; rackId?: string | null; qtyPcs: number; stockType: "SALEABLE" | "DISPLAY" | "DAMAGED"; refType: string; refId: string; refLineId?: string; ratePaise?: bigint; postedAt: Date; note?: string },
) {
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
      refLineId: e.refLineId,
      ratePaise: e.ratePaise ?? 0n,
      postedAt: e.postedAt,
      note: e.note,
    },
  });
  const key = balanceKey({ ...e, rackId: e.rackId ?? null });
  const bal = await tx.stockBalance.upsert({
    where: { key },
    create: { key, branchId: e.branchId, productId: e.productId, batchId: e.batchId, godownId: e.godownId, rackId: e.rackId ?? null, stockType: e.stockType, qtyPcs: e.qtyPcs },
    update: { qtyPcs: { increment: e.qtyPcs } },
  });
  if (bal.qtyPcs < 0) throw new Error(`demo-inventory: negative stock for ${e.productId}`);
}

const SUPPLIER_FOR_BRAND: Record<string, string> = {
  Kajaria: "Kajaria",
  Somany: "Somany",
  Johnson: "Johnson",
  Orientbell: "Orientbell",
  Nitco: "Orientbell",
  Hindware: "Jaquar",
  Jaquar: "Jaquar",
  Cera: "Jaquar",
  Roff: "Kovai",
};

/**
 * Demo stock: posted GRNs per supplier with 2–3 shade batches per tile and landed cost, a few
 * products left below reorder level, some showroom display stock, one breakage, one posted purchase
 * invoice, an open PO and a brand scheme. Skips when GRNs already exist. Stock is kept unracked so
 * the sales demo can draw from it.
 */
export async function seedDemoInventory(prisma: PrismaClient, base: Base) {
  if ((await prisma.grn.count()) > 0) {
    console.log("demo-inventory: GRNs exist, skipped");
    return;
  }
  const products = await prisma.product.findMany({ where: { deletedAt: null, isActive: true }, include: { brand: true }, orderBy: { sku: "asc" } });
  const suppliers = await prisma.party.findMany({ where: { type: { in: ["SUPPLIER", "BOTH"] }, deletedAt: null } });
  if (!products.length || !suppliers.length) {
    console.log("demo-inventory: no products or suppliers yet, skipped");
    return;
  }
  const branch = base.branch;
  const supplierFor = (p: Product & { brand: { name: string } }) => {
    const hint = SUPPLIER_FOR_BRAND[p.brand.name] ?? p.brand.name;
    return suppliers.find((s) => s.name.toLowerCase().includes(hint.toLowerCase())) ?? suppliers[0];
  };
  const groups = new Map<string, (Product & { brand: { name: string } })[]>();
  for (const p of products) {
    const s = supplierFor(p);
    groups.set(s.id, [...(groups.get(s.id) ?? []), p]);
  }

  // products intentionally left low (one small batch) so the low-stock report has rows
  const lowSkus = new Set(products.filter((p, i) => i % 9 === 4).map((p) => p.sku));
  let grnIndex = 0;
  const postedGrns: { id: string; supplierId: string; lines: { productId: string; qtyPcs: number; ratePaise: number; gstRate: number }[] }[] = [];

  for (const [supplierId, items] of groups) {
    const age = [118, 74, 41, 19, 6][grnIndex % 5];
    const date = daysAgo(age);
    grnIndex++;
    await prisma.$transaction(
      async (tx) => {
        const number = await numbering.next(tx, branch.id, "GRN", date);
        const lines: { p: Product; batchNo: string; shade: string; caliber: string; grade: "PREMIUM" | "STANDARD" | "COMMERCIAL"; qty: number; damaged: number; rate: number }[] = [];
        for (const p of items) {
          const r = rand(p.sku);
          if (p.uomType === "PIECE_BOX_AREA" && p.pcsPerBox) {
            const ratePerPc = Math.round((Number(p.mrpPaise) * 0.55) / p.pcsPerBox);
            const batches = lowSkus.has(p.sku) ? 1 : 2 + Math.floor(r * 2);
            for (let b = 0; b < batches; b++) {
              const boxes = lowSkus.has(p.sku) ? 8 + Math.floor(r * 10) : 20 + Math.floor(rand(p.sku + b) * 45);
              lines.push({
                p,
                batchNo: `${p.sku.split("-")[1]}${String(26100 + grnIndex * 10 + b)}`,
                shade: `S${b + 1}${String.fromCharCode(65 + Math.floor(rand(p.sku + "s" + b) * 3))}`,
                caliber: `C${1 + Math.floor(rand(p.sku + "c" + b) * 3)}`,
                grade: b === 2 ? "STANDARD" : "PREMIUM",
                qty: boxes * p.pcsPerBox,
                damaged: b === 0 && r > 0.85 ? Math.min(p.pcsPerBox, 4) : 0,
                rate: ratePerPc,
              });
            }
          } else {
            const qty = lowSkus.has(p.sku) ? 2 : 6 + Math.floor(r * 18);
            lines.push({ p, batchNo: "DEFAULT", shade: "-", caliber: "-", grade: "STANDARD", qty, damaged: 0, rate: Math.round(Number(p.mrpPaise) * 0.6) });
          }
        }
        const freight = 400000 + Math.floor(rand(supplierId) * 800000);
        const unloading = 150000;
        const alloc = allocateLandedCost(lines.map((l) => ({ qtyPcs: l.qty, ratePaise: l.rate })), freight + unloading, "VALUE");
        const grn = await tx.grn.create({
          data: {
            branchId: branch.id,
            number,
            date,
            supplierId,
            godownId: base.mainGodown.id,
            supplierInvoiceNo: `INV/${2600 + grnIndex * 37}`,
            truckNo: `TN 3${grnIndex} AB ${1000 + grnIndex * 211}`,
            freightPaise: BigInt(freight),
            unloadingPaise: BigInt(unloading),
            allocationBasis: "VALUE",
            status: "POSTED",
            totalValuePaise: BigInt(lines.reduce((a, l) => a + l.qty * l.rate, 0) + freight + unloading),
          },
        });
        for (const [i, l] of lines.entries()) {
          const landed = alloc[i].landedRatePaise;
          const batch = await tx.batch.upsert({
            where: { productId_batchNo: { productId: l.p.id, batchNo: l.batchNo } },
            create: { productId: l.p.id, batchNo: l.batchNo, shadeCode: l.shade, caliber: l.caliber, grade: l.grade, purchaseRatePaise: BigInt(l.rate), landedCostPaise: BigInt(landed), supplierId, grnId: grn.id, createdAt: date },
            update: { purchaseRatePaise: BigInt(l.rate), landedCostPaise: BigInt(landed) },
          });
          const line = await tx.grnLine.create({
            data: {
              grnId: grn.id,
              productId: l.p.id,
              batchId: batch.id,
              batchNo: l.batchNo === "DEFAULT" ? "" : l.batchNo,
              shadeCode: l.shade === "-" ? "" : l.shade,
              caliber: l.caliber === "-" ? "" : l.caliber,
              grade: l.grade,
              qtyPcs: l.qty,
              damagedPcs: l.damaged,
              ratePaise: BigInt(l.rate),
              landedRatePaise: BigInt(landed),
              amountPaise: BigInt(l.qty * l.rate),
            },
          });
          const common = { branchId: branch.id, productId: l.p.id, batchId: batch.id, godownId: base.mainGodown.id, refType: "GRN", refId: grn.id, refLineId: line.id, ratePaise: BigInt(landed), postedAt: date };
          await ledger(tx, { ...common, qtyPcs: l.qty - l.damaged, stockType: "SALEABLE" });
          if (l.damaged) {
            await ledger(tx, { ...common, qtyPcs: l.damaged, stockType: "DAMAGED", note: "Damaged on receipt" });
            await tx.breakageEntry.create({
              data: {
                branchId: branch.id,
                number: await numbering.next(tx, branch.id, "BREAKAGE", date),
                date,
                stage: "RECEIPT",
                productId: l.p.id,
                batchId: batch.id,
                godownId: base.mainGodown.id,
                qtyPcs: l.damaged,
                reason: `Damaged on receipt (${number})`,
                photos: [],
                status: "POSTED",
                refType: "GRN",
                refId: grn.id,
              },
            });
          }
        }
        postedGrns.push({ id: grn.id, supplierId, lines: lines.map((l) => ({ productId: l.p.id, qtyPcs: l.qty, ratePaise: l.rate, gstRate: l.p.gstRate })) });
      },
      { timeout: 120_000, maxWait: 20_000 },
    );
  }

  await prisma.$transaction(
    async (tx) => {
      // showroom display: one box of a few floor tiles moved to the showroom as DISPLAY stock
      const tiles = products.filter((p) => p.uomType === "PIECE_BOX_AREA" && p.pcsPerBox && !lowSkus.has(p.sku)).slice(0, 8);
      const date = daysAgo(30);
      const transfer = await tx.stockTransfer.create({
        data: {
          branchId: branch.id,
          number: await numbering.next(tx, branch.id, "TRANSFER", date),
          date,
          fromGodownId: base.mainGodown.id,
          toGodownId: base.showroom.id,
          status: "POSTED",
          notes: "Showroom display boards",
        },
      });
      for (const p of tiles) {
        const batch = await tx.batch.findFirstOrThrow({ where: { productId: p.id }, orderBy: { batchNo: "asc" } });
        const line = await tx.stockTransferLine.create({
          data: { transferId: transfer.id, productId: p.id, batchId: batch.id, fromStockType: "SALEABLE", toStockType: "DISPLAY", qtyPcs: p.pcsPerBox! },
        });
        const common = { branchId: branch.id, productId: p.id, batchId: batch.id, refType: "TRANSFER", refId: transfer.id, refLineId: line.id, postedAt: date };
        await ledger(tx, { ...common, godownId: base.mainGodown.id, qtyPcs: -p.pcsPerBox!, stockType: "SALEABLE" });
        await ledger(tx, { ...common, godownId: base.showroom.id, qtyPcs: p.pcsPerBox!, stockType: "DISPLAY" });
      }

      // one godown breakage
      const victim = tiles[tiles.length - 1];
      if (victim) {
        const batch = await tx.batch.findFirstOrThrow({ where: { productId: victim.id }, orderBy: { batchNo: "desc" } });
        const d = daysAgo(9);
        const bk = await tx.breakageEntry.create({
          data: {
            branchId: branch.id,
            number: await numbering.next(tx, branch.id, "BREAKAGE", d),
            date: d,
            stage: "GODOWN",
            productId: victim.id,
            batchId: batch.id,
            godownId: base.mainGodown.id,
            qtyPcs: 3,
            reason: "Corner chipped while stacking",
            photos: [],
            status: "POSTED",
          },
        });
        const common = { branchId: branch.id, productId: victim.id, batchId: batch.id, godownId: base.mainGodown.id, refType: "BREAKAGE", refId: bk.id, postedAt: d };
        await ledger(tx, { ...common, qtyPcs: -3, stockType: "SALEABLE" });
        await ledger(tx, { ...common, qtyPcs: 3, stockType: "DAMAGED" });
      }

      // purchase invoice for the Kajaria GRN (posted, queued for Tally) so the brand scheme shows progress
      const first = postedGrns.find((g) => suppliers.find((s) => s.id === g.supplierId)?.name.includes("Kajaria")) ?? postedGrns[0];
      if (first) {
        const supplier = suppliers.find((s) => s.id === first.supplierId)!;
        const inter = isInterState(branch.stateCode, supplier.stateCode);
        const t = computeDocTotals(first.lines, inter);
        const grn = await tx.grn.findUniqueOrThrow({ where: { id: first.id } });
        const pi = await tx.purchaseInvoice.create({
          data: {
            branchId: branch.id,
            number: await numbering.next(tx, branch.id, "PURCHASE_INVOICE", grn.date),
            supplierInvoiceNo: grn.supplierInvoiceNo ?? "INV/1",
            date: grn.date,
            supplierId: supplier.id,
            grnId: grn.id,
            placeOfSupply: branch.stateCode,
            isInterState: inter,
            taxablePaise: BigInt(t.taxablePaise),
            cgstPaise: BigInt(t.cgstPaise),
            sgstPaise: BigInt(t.sgstPaise),
            igstPaise: BigInt(t.igstPaise),
            roundOffPaise: BigInt(t.roundOffPaise),
            totalPaise: BigInt(t.totalPaise),
            dueDate: new Date(grn.date.getTime() + (supplier.creditDays || 30) * DAY),
            status: "POSTED",
            syncStatus: "PENDING",
            lines: {
              create: first.lines.map((l, i) => ({
                productId: l.productId,
                qtyPcs: l.qtyPcs,
                ratePaise: BigInt(l.ratePaise),
                gstRate: l.gstRate,
                taxablePaise: BigInt(t.lines[i].taxablePaise),
                taxPaise: BigInt(t.lines[i].taxPaise),
                amountPaise: BigInt(t.lines[i].amountPaise),
              })),
            },
          },
        });
        await tally.enqueueVoucher(tx, { entityType: "PURCHASE_INVOICE", entityId: pi.id, branchId: branch.id, partyId: supplier.id, productIds: [...new Set(first.lines.map((l) => l.productId))] });
      }

      // an open PO (approved, nothing received yet)
      const kajaria = products.filter((p) => p.brand.name === "Kajaria" && p.pcsPerBox).slice(0, 3);
      const poSupplier = suppliers.find((s) => s.name.includes("Kajaria")) ?? suppliers[0];
      if (kajaria.length) {
        const lines = kajaria.map((p) => ({ productId: p.id, qtyPcs: p.pcsPerBox! * 60, ratePaise: Math.round((Number(p.mrpPaise) * 0.55) / p.pcsPerBox!), gstRate: p.gstRate }));
        const t = computeDocTotals(lines, isInterState(branch.stateCode, poSupplier.stateCode));
        const d = daysAgo(3);
        await tx.purchaseOrder.create({
          data: {
            branchId: branch.id,
            number: await numbering.next(tx, branch.id, "PURCHASE_ORDER", d),
            date: d,
            supplierId: poSupplier.id,
            brandId: kajaria[0].brandId,
            expectedDate: daysAgo(-7),
            status: "APPROVED",
            notes: "Diwali season top-up",
            totalPaise: BigInt(t.totalPaise),
            lines: { create: lines.map((l, i) => ({ ...l, ratePaise: BigInt(l.ratePaise), amountPaise: BigInt(t.lines[i].taxablePaise) })) },
          },
        });
        // brand scheme for the quarter
        const exists = await tx.scheme.findFirst({ where: { brandId: kajaria[0].brandId } });
        if (!exists) {
          await tx.scheme.create({
            data: {
              brandId: kajaria[0].brandId,
              name: "Kajaria Q3 purchase target",
              periodFrom: new Date("2026-07-01T00:00:00+05:30"),
              periodTo: new Date("2026-12-31T00:00:00+05:30"),
              targetType: "VALUE",
              notes: "Rebate credited by the brand after quarter close",
              slabs: { create: [{ threshold: 50_000_000n, rebatePct: 1 }, { threshold: 150_000_000n, rebatePct: 2 }, { threshold: 300_000_000n, rebatePct: 3 }] },
            },
          });
        }
      }
    },
    { timeout: 120_000, maxWait: 20_000 },
  );
  console.log(`demo-inventory: ${postedGrns.length} GRNs posted, stock in ${products.length} products (${lowSkus.size} left low)`);
}
