import type { Prisma, PrismaClient, Product } from "@prisma/client";
import {
  DOC_PREFIX,
  financialYear,
  formatDocNo,
  isInterState,
  salesAreaQty,
  salesAreaSqft,
  salesDefaultWastage,
  salesDocTotals,
  type DocType,
} from "@gc/shared";
import { balanceKey } from "../core/ledger.service";
import type { seedBase } from "./base";

type Base = Awaited<ReturnType<typeof seedBase>>;
type Tx = Prisma.TransactionClient;

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const spec = (p: Product) => ({ uomType: p.uomType, pcsPerBox: p.pcsPerBox, sqftPerBox: p.sqftPerBox, allowLooseSale: p.allowLooseSale, gstRate: p.gstRate });

async function nextNo(tx: Tx, branchId: string, branchCode: string, docType: DocType, date: Date) {
  const fy = financialYear(date);
  const s = await tx.numberSeries.upsert({
    where: { branchId_docType_fy: { branchId, docType, fy } },
    create: { branchId, docType, fy, prefix: DOC_PREFIX[docType], nextNo: 2 },
    update: { nextNo: { increment: 1 } },
  });
  return formatDocNo(s.prefix, branchCode, fy, s.nextNo - 1, s.padding);
}

/** Same writes as LedgerService.post: a stock_ledger row + stock_balance upsert. */
async function ledger(
  tx: Tx,
  e: { branchId: string; productId: string; batchId: string; godownId: string; qtyPcs: number; stockType: "SALEABLE" | "RESERVED" | "DAMAGED"; refType: string; refId: string; refLineId?: string; ratePaise?: bigint; postedAt?: Date; note?: string },
) {
  await tx.stockLedger.create({
    data: { branchId: e.branchId, productId: e.productId, batchId: e.batchId, godownId: e.godownId, qtyPcs: e.qtyPcs, stockType: e.stockType, refType: e.refType, refId: e.refId, refLineId: e.refLineId, ratePaise: e.ratePaise ?? 0n, postedAt: e.postedAt ?? new Date(), note: e.note },
  });
  const key = balanceKey({ ...e, rackId: null });
  const bal = await tx.stockBalance.upsert({
    where: { key },
    create: { key, branchId: e.branchId, productId: e.productId, batchId: e.batchId, godownId: e.godownId, stockType: e.stockType, qtyPcs: e.qtyPcs },
    update: { qtyPcs: { increment: e.qtyPcs } },
  });
  if (bal.qtyPcs < 0) throw new Error(`demo-sales: negative stock for ${e.productId}`);
}

async function priceOf(prisma: PrismaClient, p: Product, segment: string) {
  for (const seg of [segment, "RETAIL"]) {
    const item = await prisma.priceListItem.findFirst({
      where: { productId: p.id, deletedAt: null, priceList: { segment: seg as never, isActive: true } },
      orderBy: { validFrom: "desc" },
    });
    if (item) return { priceBasis: item.priceBasis, enteredRatePaise: Number(item.pricePaise) };
  }
  return { priceBasis: p.uomType === "PIECE_BOX_AREA" ? ("PER_BOX" as const) : ("PER_UNIT" as const), enteredRatePaise: Number(p.mrpPaise) };
}

/** Free stock per product+batch+godown (SALEABLE − RESERVED) in the branch. */
async function freeStock(prisma: PrismaClient | Tx, branchId: string) {
  const rows = await prisma.stockBalance.groupBy({ by: ["productId", "batchId", "godownId", "stockType"], where: { branchId, stockType: { in: ["SALEABLE", "RESERVED"] } }, _sum: { qtyPcs: true } });
  const map = new Map<string, { productId: string; batchId: string; godownId: string; free: number }>();
  for (const r of rows) {
    const k = `${r.productId}|${r.batchId}|${r.godownId}`;
    const cur = map.get(k) ?? { productId: r.productId, batchId: r.batchId, godownId: r.godownId, free: 0 };
    cur.free += (r.stockType === "SALEABLE" ? 1 : -1) * (r._sum.qtyPcs ?? 0);
    map.set(k, cur);
  }
  return [...map.values()].filter((x) => x.free > 0).sort((a, b) => b.free - a.free);
}

/**
 * Demo quotations, orders, posted invoices (one inter-state), a challan with dispatch. Idempotent:
 * quotations only when none exist; orders/invoices only when none exist and stock is available.
 */
export async function seedDemoSales(prisma: PrismaClient, base: Base) {
  const branch = base.branch;
  const owner = await prisma.user.findUnique({ where: { email: "admin@kailashceramics.com" } });
  const by = { createdBy: owner?.id ?? null, updatedBy: owner?.id ?? null };
  const products = await prisma.product.findMany({ where: { deletedAt: null, isActive: true }, include: { category: true, size: true } });
  const customers = await prisma.party.findMany({ where: { type: { in: ["CUSTOMER", "BOTH"] }, deletedAt: null }, include: { sites: true } });
  if (!products.length || !customers.length) {
    console.log("demo-sales: no products/customers yet, skipped");
    return;
  }
  const tiles = products.filter((p) => p.uomType === "PIECE_BOX_AREA");
  const floorTile = tiles.find((p) => p.size?.name === "600x1200") ?? tiles[0];
  const wallTile = tiles.find((p) => p.size?.name === "300x450" || p.category.name.toLowerCase().includes("wall")) ?? tiles[1] ?? tiles[0];
  const units = products.filter((p) => p.uomType === "UNIT");
  const cust = (name: string) => customers.find((c) => c.name === name) ?? customers[0];
  const settingsRows = await prisma.setting.findMany();
  const settings = Object.fromEntries(settingsRows.map((s) => [s.key, s.value]));

  // ---------------------------------------------------------------- quotations
  if ((await prisma.quotation.count()) === 0 && floorTile) {
    type Room = { name: string; lengthFt: number; widthFt: number; heightFt?: number; deductionsSqft?: number; areas: { areaType: "FLOOR" | "WALL"; product: Product; discountPct?: number }[] };
    const quotes: { party?: (typeof customers)[number]; walkIn?: { name: string; phone: string }; status: "DRAFT" | "SENT" | "ACCEPTED"; daysAgo: number; rooms: Room[]; items: { product: Product; qty: number }[] }[] = [
      {
        party: cust("Sri Murugan Constructions"),
        status: "SENT",
        daysAgo: 6,
        rooms: [
          { name: "Living & dining", lengthFt: 18, widthFt: 14, areas: [{ areaType: "FLOOR", product: floorTile, discountPct: 3 }] },
          { name: "Master bathroom", lengthFt: 8, widthFt: 6, heightFt: 7, deductionsSqft: 21, areas: [{ areaType: "WALL", product: wallTile }, { areaType: "FLOOR", product: tiles.find((p) => p.size?.name === "400x400") ?? floorTile }] },
        ],
        items: units.slice(0, 2).map((p) => ({ product: p, qty: 2 })),
      },
      {
        walkIn: { name: "Mr. Ganesh (walk-in)", phone: "9842099887" },
        status: "DRAFT",
        daysAgo: 1,
        rooms: [{ name: "Kitchen", lengthFt: 10, widthFt: 8, heightFt: 2, areas: [{ areaType: "FLOOR", product: floorTile }, { areaType: "WALL", product: wallTile }] }],
        items: [],
      },
      {
        party: cust("Lakshmi Builders & Developers"),
        status: "ACCEPTED",
        daysAgo: 12,
        rooms: [{ name: "Lobby", lengthFt: 30, widthFt: 20, areas: [{ areaType: "FLOOR", product: tiles.find((p) => p.size?.name === "800x1600") ?? floorTile, discountPct: 5 }] }],
        items: units.slice(2, 4).map((p) => ({ product: p, qty: 6 })),
      },
    ];
    for (const q of quotes) {
      await prisma.$transaction(async (tx) => {
        const date = daysAgo(q.daysAgo);
        const number = await nextNo(tx, branch.id, branch.code, "QUOTATION", date);
        const pos = q.party?.stateCode ?? branch.stateCode;
        const inter = isInterState(branch.stateCode, pos);
        const calc: { roomIdx?: number; areaIdx?: number; areaSqft?: number; wastage?: number; product: Product; qtyPcs: number; boxes: number; loose: number; priceBasis: string; enteredRatePaise: number; discountPct: number }[] = [];
        for (const [ri, r] of q.rooms.entries()) {
          for (const [ai, a] of r.areas.entries()) {
            const sqft = salesAreaSqft({ lengthFt: r.lengthFt, widthFt: r.widthFt, heightFt: r.heightFt, deductionsSqft: r.deductionsSqft }, a.areaType);
            const wastage = salesDefaultWastage(a.areaType, settings);
            const qty = salesAreaQty(spec(a.product), sqft, wastage);
            const price = await priceOf(prisma, a.product, q.party?.segment ?? "RETAIL");
            calc.push({ roomIdx: ri, areaIdx: ai, areaSqft: sqft, wastage, product: a.product, qtyPcs: qty.qtyPcs, boxes: qty.boxes, loose: qty.loosePcs, ...price, discountPct: a.discountPct ?? 0 });
          }
        }
        for (const it of q.items) {
          const price = await priceOf(prisma, it.product, q.party?.segment ?? "RETAIL");
          calc.push({ product: it.product, qtyPcs: it.qty, boxes: 0, loose: it.qty, ...price, discountPct: 0 });
        }
        const transport = 150000;
        const t = salesDocTotals(calc.map((c) => ({ product: spec(c.product), line: c })), inter, transport, 18);
        const quote = await tx.quotation.create({
          data: {
            branchId: branch.id,
            number,
            partyId: q.party?.id ?? null,
            customerName: q.party?.name ?? q.walkIn?.name ?? null,
            customerPhone: q.party?.phone ?? q.walkIn?.phone ?? null,
            siteId: q.party?.sites[0]?.id ?? null,
            date,
            validUntil: new Date(date.getTime() + 15 * DAY),
            status: q.status,
            placeOfSupply: pos,
            transportPaise: BigInt(transport),
            subtotalPaise: BigInt(t.subtotalPaise),
            discountPaise: BigInt(t.discountPaise),
            taxablePaise: BigInt(t.taxablePaise),
            cgstPaise: BigInt(t.cgstPaise),
            sgstPaise: BigInt(t.sgstPaise),
            igstPaise: BigInt(t.igstPaise),
            roundOffPaise: BigInt(t.roundOffPaise),
            totalPaise: BigInt(t.totalPaise),
            ...by,
          },
        });
        const areaIds = new Map<string, string>();
        for (const [ri, r] of q.rooms.entries()) {
          const room = await tx.quotationRoom.create({ data: { quotationId: quote.id, name: r.name, lengthFt: r.lengthFt, widthFt: r.widthFt, heightFt: r.heightFt ?? null, deductionsSqft: r.deductionsSqft ?? 0, sortOrder: ri, ...by } });
          for (const [ai, a] of r.areas.entries()) {
            const c = calc.find((x) => x.roomIdx === ri && x.areaIdx === ai)!;
            const area = await tx.quotationArea.create({ data: { roomId: room.id, areaType: a.areaType, areaSqft: c.areaSqft!, wastagePct: c.wastage!, ...by } });
            areaIds.set(`${ri}:${ai}`, area.id);
          }
        }
        for (const [i, c] of calc.entries()) {
          const lt = t.lines[i];
          await tx.quotationLine.create({
            data: {
              quotationId: quote.id,
              areaId: c.roomIdx !== undefined ? areaIds.get(`${c.roomIdx}:${c.areaIdx}`)! : null,
              productId: c.product.id,
              reqSqft: c.areaSqft ?? null,
              boxes: c.boxes,
              loosePcs: c.loose,
              qtyPcs: c.qtyPcs,
              priceBasis: c.priceBasis as never,
              enteredRatePaise: BigInt(c.enteredRatePaise),
              ratePaise: BigInt(t.rates[i]),
              discountPct: c.discountPct,
              gstRate: c.product.gstRate,
              taxablePaise: BigInt(lt.taxablePaise),
              taxPaise: BigInt(lt.taxPaise),
              amountPaise: BigInt(lt.amountPaise),
              sortOrder: i,
              ...by,
            },
          });
        }
      });
    }
    console.log(`demo-sales: ${quotes.length} quotations`);
  }

  // ---------------------------------------------------------------- invoices & orders
  if ((await prisma.invoice.count()) > 0 || (await prisma.salesOrder.count()) > 0) return;
  const stock = await freeStock(prisma, branch.id);
  if (!stock.length) {
    console.log("demo-sales: no stock yet, skipped orders/invoices");
    return;
  }
  const productById = new Map(products.map((p) => [p.id, p]));

  /** Take up to `want` pcs (rounded to whole boxes for tiles) from the freest batch of a product. */
  const take = (productId: string, want: number) => {
    const p = productById.get(productId)!;
    const src = stock.find((s) => s.productId === productId && s.free > 0);
    if (!src) return null;
    let qty = Math.min(want, src.free);
    if (p.uomType === "PIECE_BOX_AREA" && p.pcsPerBox && !p.allowLooseSale) qty = Math.floor(qty / p.pcsPerBox) * p.pcsPerBox;
    if (qty <= 0) return null;
    src.free -= qty;
    return { product: p, batchId: src.batchId, godownId: src.godownId, qtyPcs: qty };
  };
  const stockedTiles = [...new Set(stock.map((s) => s.productId))].map((id) => productById.get(id)!).filter((p) => p && p.uomType === "PIECE_BOX_AREA");
  const stockedUnits = [...new Set(stock.map((s) => s.productId))].map((id) => productById.get(id)!).filter((p) => p && p.uomType === "UNIT");
  const tileQty = (p: Product, boxes: number) => (p.pcsPerBox ?? 1) * boxes;

  const plans: { party: (typeof customers)[number]; daysAgo: number; lines: { productId: string; want: number; discountPct?: number }[]; transport?: number }[] = [
    { party: cust("Sri Murugan Constructions"), daysAgo: 55, transport: 250000, lines: [stockedTiles[0] && { productId: stockedTiles[0].id, want: tileQty(stockedTiles[0], 40), discountPct: 3 }, stockedUnits[0] && { productId: stockedUnits[0].id, want: 4 }].filter(Boolean) as any },
    { party: cust("Annai Interiors"), daysAgo: 40, lines: [stockedTiles[1] && { productId: stockedTiles[1].id, want: tileQty(stockedTiles[1], 25) }, stockedUnits[1] && { productId: stockedUnits[1].id, want: 3 }].filter(Boolean) as any },
    { party: cust("Palakkad Home Decor"), daysAgo: 25, transport: 400000, lines: [stockedTiles[2] && { productId: stockedTiles[2].id, want: tileQty(stockedTiles[2], 30), discountPct: 5 }].filter(Boolean) as any },
    { party: cust("R. Senthil Kumar"), daysAgo: 10, lines: [stockedTiles[0] && { productId: stockedTiles[0].id, want: tileQty(stockedTiles[0], 12) }, stockedUnits[2] && { productId: stockedUnits[2].id, want: 1 }].filter(Boolean) as any },
    { party: cust("Selvam Tiles & Sanitary"), daysAgo: 2, lines: [stockedTiles[3] && { productId: stockedTiles[3].id, want: tileQty(stockedTiles[3], 20), discountPct: 2 }, stockedUnits[0] && { productId: stockedUnits[0].id, want: 2 }].filter(Boolean) as any },
  ];

  let lastInvoiceId: string | null = null;
  let count = 0;
  for (const plan of plans) {
    const picked = plan.lines.map((l) => ({ l, t: take(l.productId, l.want) })).filter((x) => x.t);
    if (!picked.length) continue;
    await prisma.$transaction(async (tx) => {
      const date = daysAgo(plan.daysAgo);
      const pos = plan.party.stateCode;
      const inter = isInterState(branch.stateCode, pos);
      const lines = await Promise.all(picked.map(async ({ l, t }) => ({ t: t!, price: await priceOf(prisma, t!.product, plan.party.segment), discountPct: l.discountPct ?? 0 })));
      const tot = salesDocTotals(lines.map((x) => ({ product: spec(x.t.product), line: { qtyPcs: x.t.qtyPcs, ...x.price, discountPct: x.discountPct } })), inter, plan.transport ?? 0, 18);
      const number = await nextNo(tx, branch.id, branch.code, "INVOICE", date);
      const inv = await tx.invoice.create({
        data: {
          branchId: branch.id,
          number,
          date,
          partyId: plan.party.id,
          siteId: plan.party.sites[0]?.id ?? null,
          placeOfSupply: pos,
          isInterState: inter,
          status: "POSTED",
          postedAt: date,
          dueDate: new Date(date.getTime() + plan.party.creditDays * DAY),
          transportPaise: BigInt(plan.transport ?? 0),
          subtotalPaise: BigInt(tot.subtotalPaise),
          discountPaise: BigInt(tot.discountPaise),
          taxablePaise: BigInt(tot.taxablePaise),
          cgstPaise: BigInt(tot.cgstPaise),
          sgstPaise: BigInt(tot.sgstPaise),
          igstPaise: BigInt(tot.igstPaise),
          roundOffPaise: BigInt(tot.roundOffPaise),
          totalPaise: BigInt(tot.totalPaise),
          syncStatus: "PENDING",
          ...by,
        },
      });
      for (const [i, x] of lines.entries()) {
        const lt = tot.lines[i];
        const line = await tx.invoiceLine.create({
          data: {
            invoiceId: inv.id,
            productId: x.t.product.id,
            batchId: x.t.batchId,
            godownId: x.t.godownId,
            hsn: x.t.product.hsn,
            qtyPcs: x.t.qtyPcs,
            ratePaise: BigInt(tot.rates[i]),
            discountPct: x.discountPct,
            gstRate: x.t.product.gstRate,
            taxablePaise: BigInt(lt.taxablePaise),
            cgstPaise: BigInt(lt.cgstPaise),
            sgstPaise: BigInt(lt.sgstPaise),
            igstPaise: BigInt(lt.igstPaise),
            amountPaise: BigInt(lt.amountPaise),
            sortOrder: i,
            ...by,
          },
        });
        await ledger(tx, { branchId: branch.id, productId: x.t.product.id, batchId: x.t.batchId, godownId: x.t.godownId, qtyPcs: -x.t.qtyPcs, stockType: "SALEABLE", refType: "INVOICE", refId: inv.id, refLineId: line.id, ratePaise: BigInt(tot.rates[i]), postedAt: date, note: number });
      }
      if (!plan.party.tallyLedgerGuid) {
        const exists = await tx.tallySyncQueue.findFirst({ where: { entityType: "LEDGER", entityId: plan.party.id } });
        if (!exists) await tx.tallySyncQueue.create({ data: { entityType: "LEDGER", entityId: plan.party.id, branchId: branch.id, priority: 10, ...by } });
      }
      await tx.tallySyncQueue.create({ data: { entityType: "INVOICE", entityId: inv.id, branchId: branch.id, priority: 50, ...by } });
      lastInvoiceId = inv.id;
      count++;
    });
  }
  console.log(`demo-sales: ${count} posted invoices`);

  // challan + dispatch for the latest invoice
  if (lastInvoiceId) {
    await prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.findUniqueOrThrow({ where: { id: lastInvoiceId! }, include: { lines: true } });
      const number = await nextNo(tx, branch.id, branch.code, "CHALLAN", inv.date);
      const challan = await tx.deliveryChallan.create({
        data: {
          branchId: branch.id,
          number,
          date: inv.date,
          invoiceId: inv.id,
          partyId: inv.partyId,
          siteId: inv.siteId,
          status: "COMPLETED",
          ...by,
          lines: { create: inv.lines.map((l) => ({ productId: l.productId, batchId: l.batchId, godownId: l.godownId, qtyPcs: l.qtyPcs, ...by })) },
        },
      });
      const vehicle = await tx.vehicle.upsert({ where: { number: "TN37CK4521" }, create: { number: "TN37CK4521", type: "Tata 407", driverName: "Ravi", driverPhone: "9876501234", ...by }, update: {} });
      await tx.dispatch.create({
        data: { branchId: branch.id, challanId: challan.id, invoiceId: inv.id, vehicleId: vehicle.id, driverName: "Ravi", driverPhone: "9876501234", loadingPaise: 30000n, unloadingPaise: 40000n, dispatchedAt: inv.date, deliveredAt: new Date(inv.date.getTime() + 5 * 3_600_000), status: "COMPLETED", ...by },
      });
    });
  }

  // one confirmed order (with reservation) and one draft order
  const confirmedParty = cust("Lakshmi Builders & Developers");
  const draftParty = cust("Annai Interiors");
  for (const [i, party] of [confirmedParty, draftParty].entries()) {
    const tile = stockedTiles[i] ?? stockedTiles[0];
    if (!tile) break;
    const t = take(tile.id, tileQty(tile, 15));
    if (!t) continue;
    await prisma.$transaction(async (tx) => {
      const date = daysAgo(i === 0 ? 3 : 0);
      const inter = isInterState(branch.stateCode, party.stateCode);
      const price = await priceOf(prisma, tile, party.segment);
      const tot = salesDocTotals([{ product: spec(tile), line: { qtyPcs: t.qtyPcs, ...price, discountPct: 0 } }], inter, 0, 18);
      const number = await nextNo(tx, branch.id, branch.code, "SALES_ORDER", date);
      const confirmed = i === 0;
      const order = await tx.salesOrder.create({
        data: {
          branchId: branch.id,
          number,
          date,
          partyId: party.id,
          siteId: party.sites[0]?.id ?? null,
          status: confirmed ? "APPROVED" : "DRAFT",
          placeOfSupply: party.stateCode,
          deliveryDate: new Date(date.getTime() + 7 * DAY),
          subtotalPaise: BigInt(tot.subtotalPaise),
          taxablePaise: BigInt(tot.taxablePaise),
          cgstPaise: BigInt(tot.cgstPaise),
          sgstPaise: BigInt(tot.sgstPaise),
          igstPaise: BigInt(tot.igstPaise),
          roundOffPaise: BigInt(tot.roundOffPaise),
          totalPaise: BigInt(tot.totalPaise),
          ...by,
        },
      });
      const line = await tx.salesOrderLine.create({
        data: {
          orderId: order.id,
          productId: tile.id,
          batchId: confirmed ? t.batchId : null,
          godownId: confirmed ? t.godownId : null,
          qtyPcs: t.qtyPcs,
          ratePaise: BigInt(tot.rates[0]),
          gstRate: tile.gstRate,
          taxablePaise: BigInt(tot.lines[0].taxablePaise),
          taxPaise: BigInt(tot.lines[0].taxPaise),
          amountPaise: BigInt(tot.lines[0].amountPaise),
          ...by,
        },
      });
      if (confirmed) {
        await ledger(tx, { branchId: branch.id, productId: tile.id, batchId: t.batchId, godownId: t.godownId, qtyPcs: t.qtyPcs, stockType: "RESERVED", refType: "SALES_ORDER", refId: order.id, refLineId: line.id, note: `Reserved for ${number}` });
      }
    });
  }
  console.log("demo-sales: 2 sales orders, 1 challan");
}
