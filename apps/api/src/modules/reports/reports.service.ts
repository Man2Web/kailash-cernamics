import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ageingBucket, daysBetween } from "@gc/shared";
import { PrismaService } from "../../prisma/prisma.service";
import type { AuthUser } from "../../common/context";

const n = (v: bigint | number | null | undefined) => Number(v ?? 0);
const IST = 330 * 60_000;

export function istStartOfDay(d = new Date()) {
  const ist = new Date(d.getTime() + IST);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST);
}
export function istStartOfMonth(d = new Date()) {
  const ist = new Date(d.getTime() + IST);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - IST);
}

export type ColType = "text" | "money" | "number" | "pct" | "date";
export interface ReportResult {
  title: string;
  columns: { key: string; label: string; type: ColType }[];
  rows: Record<string, unknown>[];
  totals?: Record<string, number>;
}

export const REPORTS: { key: string; title: string; perm?: "cost.read" }[] = [
  { key: "sales-by-brand", title: "Sales by brand" },
  { key: "sales-by-category", title: "Sales by category" },
  { key: "sales-by-salesperson", title: "Sales by salesperson" },
  { key: "sales-by-branch", title: "Sales by branch" },
  { key: "margin-by-brand", title: "Margin by brand", perm: "cost.read" },
  { key: "movers-by-shade", title: "Fast & slow movers by shade" },
  { key: "movers-by-size", title: "Fast & slow movers by size" },
  { key: "breakage", title: "Breakage summary" },
  { key: "scheme-progress", title: "Brand scheme progress" },
  { key: "influencer-performance", title: "Influencer performance" },
  { key: "outstanding-summary", title: "Outstanding summary (ageing)" },
];

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // ------------------------------------------------------------------ dashboard

  async dashboard(user: AuthUser, branchId: string) {
    const today = istStartOfDay();
    const month = istStartOfMonth();
    const posted = { status: "POSTED" as const, deletedAt: null, branchId };
    const canCost = user.permissions.has("cost.read");
    const tomorrow = new Date(today.getTime() + 86_400_000);

    const [salesToday, salesMonth, openInv, pendingApprovals, queuePending, queueFailed, agents, monthLines, products, balances, followups, receiptsToday] = await Promise.all([
      this.prisma.invoice.aggregate({ where: { ...posted, date: { gte: today } }, _sum: { totalPaise: true }, _count: true }),
      this.prisma.invoice.aggregate({ where: { ...posted, date: { gte: month } }, _sum: { totalPaise: true, taxablePaise: true }, _count: true }),
      this.prisma.invoice.findMany({ where: posted, select: { totalPaise: true, paidPaise: true, date: true, party: { select: { creditDays: true } } } }),
      this.prisma.approvalRequest.count({ where: { status: "PENDING", deletedAt: null } }),
      this.prisma.tallySyncQueue.count({ where: { status: { in: ["PENDING", "SENT"] }, deletedAt: null } }),
      this.prisma.tallySyncQueue.count({ where: { status: "FAILED", deletedAt: null } }),
      this.prisma.tallyAgent.findMany({ where: { deletedAt: null, isActive: true }, select: { id: true, name: true, lastSeenAt: true, tallyRunning: true } }),
      this.prisma.invoiceLine.findMany({
        where: { deletedAt: null, invoice: { ...posted, date: { gte: month } } },
        select: { taxablePaise: true, product: { select: { brand: { select: { name: true } } } } },
      }),
      this.prisma.product.findMany({ where: { deletedAt: null, isActive: true, reorderLevelPcs: { gt: 0 } }, select: { id: true, sku: true, name: true, reorderLevelPcs: true, pcsPerBox: true } }),
      this.prisma.stockBalance.groupBy({ by: ["productId", "batchId", "stockType"], where: { branchId, stockType: { in: ["SALEABLE", "RESERVED"] } }, _sum: { qtyPcs: true } }),
      this.prisma.followup.findMany({
        where: { deletedAt: null, doneAt: null, dueAt: { lt: tomorrow }, lead: { branchId, deletedAt: null } },
        include: { lead: { select: { id: true, name: true, phone: true, status: true } } },
        orderBy: { dueAt: "asc" },
        take: 8,
      }),
      this.prisma.receipt.aggregate({ where: { status: "POSTED", deletedAt: null, branchId, date: { gte: today } }, _sum: { amountPaise: true } }),
    ]);

    let outstanding = 0;
    let overdue = 0;
    for (const i of openInv) {
      const due = n(i.totalPaise) - n(i.paidPaise);
      if (due <= 0) continue;
      outstanding += due;
      if (daysBetween(i.date) > (i.party?.creditDays ?? 0)) overdue += due;
    }

    const brandMap = new Map<string, number>();
    for (const l of monthLines) brandMap.set(l.product.brand.name, (brandMap.get(l.product.brand.name) ?? 0) + n(l.taxablePaise));
    const topBrands = [...brandMap.entries()].map(([name, valuePaise]) => ({ name, valuePaise })).sort((a, b) => b.valuePaise - a.valuePaise).slice(0, 6);

    const avail = new Map<string, number>();
    for (const b of balances) avail.set(b.productId, (avail.get(b.productId) ?? 0) + (b.stockType === "SALEABLE" ? 1 : -1) * (b._sum.qtyPcs ?? 0));
    const lowStock = products
      .map((p) => ({ ...p, availablePcs: avail.get(p.id) ?? 0 }))
      .filter((p) => p.availablePcs <= p.reorderLevelPcs)
      .sort((a, b) => a.availablePcs / (a.reorderLevelPcs || 1) - b.availablePcs / (b.reorderLevelPcs || 1));

    let stockValuePaise: number | null = null;
    if (canCost) {
      const saleable = balances.filter((b) => b.stockType === "SALEABLE");
      const batches = await this.prisma.batch.findMany({ where: { id: { in: [...new Set(saleable.map((b) => b.batchId))] } }, select: { id: true, landedCostPaise: true, purchaseRatePaise: true } });
      const cost = new Map(batches.map((b) => [b.id, n(b.landedCostPaise) || n(b.purchaseRatePaise)]));
      stockValuePaise = saleable.reduce((a, b) => a + (b._sum.qtyPcs ?? 0) * (cost.get(b.batchId) ?? 0), 0);
    }

    const silentAgents = agents.filter((a) => !a.lastSeenAt || Date.now() - a.lastSeenAt.getTime() > 15 * 60_000);
    return {
      salesTodayPaise: n(salesToday._sum.totalPaise),
      invoicesToday: salesToday._count,
      salesMonthPaise: n(salesMonth._sum.totalPaise),
      invoicesMonth: salesMonth._count,
      receiptsTodayPaise: n(receiptsToday._sum.amountPaise),
      outstandingPaise: outstanding,
      overduePaise: overdue,
      stockValuePaise,
      pendingApprovals,
      tally: { pending: queuePending, failed: queueFailed, agents: agents.length, silentAgents: silentAgents.map((a) => a.name), lastSeenAt: agents.map((a) => a.lastSeenAt).filter(Boolean).sort().pop() ?? null },
      topBrands,
      lowStockCount: lowStock.length,
      lowStock: lowStock.slice(0, 8),
      followups,
    };
  }

  // ------------------------------------------------------------------ reports

  async run(name: string, user: AuthUser, q: { from?: Date; to?: Date; branchId?: string }): Promise<ReportResult> {
    const def = REPORTS.find((r) => r.key === name);
    if (!def) throw new BadRequestException("Unknown report");
    if (def.perm && !user.permissions.has(def.perm)) throw new ForbiddenException("You don't have permission (cost.read)");
    const from = q.from ?? istStartOfMonth();
    const to = q.to ? new Date(q.to.getTime() + 86_400_000 - 1) : new Date();
    const invWhere: Prisma.InvoiceWhereInput = { status: "POSTED", deletedAt: null, date: { gte: from, lte: to }, ...(q.branchId ? { branchId: q.branchId } : {}) };

    switch (name) {
      case "sales-by-brand":
      case "sales-by-category":
      case "margin-by-brand": {
        const lines = await this.prisma.invoiceLine.findMany({
          where: { deletedAt: null, invoice: invWhere },
          select: {
            qtyPcs: true,
            taxablePaise: true,
            amountPaise: true,
            batch: { select: { landedCostPaise: true, purchaseRatePaise: true } },
            product: { select: { pcsPerBox: true, sqftPerBox: true, brand: { select: { name: true } }, category: { select: { name: true } } } },
          },
        });
        const key = name === "sales-by-category" ? (l: (typeof lines)[number]) => l.product.category.name : (l: (typeof lines)[number]) => l.product.brand.name;
        const map = new Map<string, { qtyPcs: number; sqft: number; taxable: number; gross: number; cost: number }>();
        for (const l of lines) {
          const k = key(l);
          const m = map.get(k) ?? { qtyPcs: 0, sqft: 0, taxable: 0, gross: 0, cost: 0 };
          m.qtyPcs += l.qtyPcs;
          if (l.product.pcsPerBox && l.product.sqftPerBox) m.sqft += (l.qtyPcs * l.product.sqftPerBox) / l.product.pcsPerBox;
          m.taxable += n(l.taxablePaise);
          m.gross += n(l.amountPaise);
          m.cost += l.qtyPcs * (n(l.batch?.landedCostPaise) || n(l.batch?.purchaseRatePaise));
          map.set(k, m);
        }
        const rows = [...map.entries()].map(([k, m]) => ({
          name: k,
          qtyPcs: m.qtyPcs,
          sqft: Math.round(m.sqft * 10) / 10,
          taxablePaise: m.taxable,
          grossPaise: m.gross,
          ...(name === "margin-by-brand" ? { costPaise: m.cost, marginPaise: m.taxable - m.cost, marginPct: m.taxable ? Math.round(((m.taxable - m.cost) / m.taxable) * 1000) / 10 : 0 } : {}),
        }));
        rows.sort((a, b) => b.taxablePaise - a.taxablePaise);
        const label = name === "sales-by-category" ? "Category" : "Brand";
        const cols: ReportResult["columns"] = [
          { key: "name", label, type: "text" },
          { key: "qtyPcs", label: "Qty (pcs/units)", type: "number" },
          { key: "sqft", label: "Sq ft", type: "number" },
          { key: "taxablePaise", label: "Taxable value", type: "money" },
        ];
        if (name === "margin-by-brand") cols.push({ key: "costPaise", label: "Landed cost", type: "money" }, { key: "marginPaise", label: "Margin", type: "money" }, { key: "marginPct", label: "Margin %", type: "pct" });
        else cols.push({ key: "grossPaise", label: "With GST", type: "money" });
        return { title: REPORTS.find((r) => r.key === name)!.title, columns: cols, rows, totals: sumCols(rows, ["qtyPcs", "sqft", "taxablePaise", "grossPaise", "costPaise", "marginPaise"]) };
      }
      case "sales-by-salesperson":
      case "sales-by-branch": {
        const byBranch = name === "sales-by-branch";
        const groups = await this.prisma.invoice.groupBy({
          by: [byBranch ? "branchId" : "salespersonId"],
          where: invWhere,
          _sum: { taxablePaise: true, totalPaise: true, paidPaise: true },
          _count: true,
        });
        const ids = groups.map((g) => (byBranch ? g.branchId : g.salespersonId)).filter(Boolean) as string[];
        const names = byBranch
          ? new Map((await this.prisma.branch.findMany({ where: { id: { in: ids } } })).map((b) => [b.id, `${b.code} · ${b.name}`]))
          : new Map((await this.prisma.user.findMany({ where: { id: { in: ids } } })).map((u) => [u.id, u.name]));
        const rows = groups
          .map((g) => {
            const id = (byBranch ? g.branchId : g.salespersonId) as string | null;
            return { name: id ? (names.get(id) ?? id) : "Not set", invoices: g._count, taxablePaise: n(g._sum.taxablePaise), totalPaise: n(g._sum.totalPaise), collectedPaise: n(g._sum.paidPaise) };
          })
          .sort((a, b) => b.totalPaise - a.totalPaise);
        return {
          title: byBranch ? "Sales by branch" : "Sales by salesperson",
          columns: [
            { key: "name", label: byBranch ? "Branch" : "Salesperson", type: "text" },
            { key: "invoices", label: "Invoices", type: "number" },
            { key: "taxablePaise", label: "Taxable value", type: "money" },
            { key: "totalPaise", label: "Invoice value", type: "money" },
            { key: "collectedPaise", label: "Collected", type: "money" },
          ],
          rows,
          totals: sumCols(rows, ["invoices", "taxablePaise", "totalPaise", "collectedPaise"]),
        };
      }
      case "movers-by-shade":
      case "movers-by-size": {
        const byShade = name === "movers-by-shade";
        const sold = await this.prisma.stockLedger.findMany({
          where: { refType: { in: ["INVOICE", "invoice", "CHALLAN", "challan"] }, qtyPcs: { lt: 0 }, stockType: "SALEABLE", postedAt: { gte: from, lte: to } },
          select: { productId: true, batchId: true, qtyPcs: true },
        });
        const bal = await this.prisma.stockBalance.groupBy({ by: ["productId", "batchId"], where: { stockType: "SALEABLE", ...(q.branchId ? { branchId: q.branchId } : {}) }, _sum: { qtyPcs: true } });
        const productIds = [...new Set([...sold.map((s) => s.productId), ...bal.map((b) => b.productId)])];
        const batchIds = [...new Set([...sold.map((s) => s.batchId), ...bal.map((b) => b.batchId)])];
        const [prods, batches] = await Promise.all([
          this.prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, sku: true, name: true, pcsPerBox: true, uomType: true, size: { select: { name: true } } } }),
          this.prisma.batch.findMany({ where: { id: { in: batchIds } }, select: { id: true, batchNo: true, shadeCode: true, createdAt: true } }),
        ]);
        const pm = new Map(prods.map((p) => [p.id, p]));
        const bm = new Map(batches.map((b) => [b.id, b]));
        const map = new Map<string, { name: string; detail: string; soldPcs: number; stockPcs: number; ageDays: number }>();
        const keyOf = (productId: string, batchId: string) => {
          const p = pm.get(productId);
          const b = bm.get(batchId);
          if (byShade) return { k: `${productId}|${b?.shadeCode}`, name: `${p?.name ?? ""} (${p?.sku ?? ""})`, detail: `Shade ${b?.shadeCode ?? "-"}` };
          return { k: p?.size?.name ?? (p?.uomType === "UNIT" ? "Unit items" : "No size"), name: p?.size?.name ?? (p?.uomType === "UNIT" ? "Unit items" : "No size"), detail: "" };
        };
        for (const s of sold) {
          const { k, name: nm, detail } = keyOf(s.productId, s.batchId);
          const m = map.get(k) ?? { name: nm, detail, soldPcs: 0, stockPcs: 0, ageDays: 0 };
          m.soldPcs += -s.qtyPcs;
          map.set(k, m);
        }
        for (const b of bal) {
          const { k, name: nm, detail } = keyOf(b.productId, b.batchId);
          const m = map.get(k) ?? { name: nm, detail, soldPcs: 0, stockPcs: 0, ageDays: 0 };
          m.stockPcs += b._sum.qtyPcs ?? 0;
          const batch = bm.get(b.batchId);
          if (batch && (b._sum.qtyPcs ?? 0) > 0) m.ageDays = Math.max(m.ageDays, daysBetween(batch.createdAt));
          map.set(k, m);
        }
        const rows = [...map.values()]
          .map((m) => ({ ...m, turnover: m.stockPcs > 0 ? Math.round((m.soldPcs / m.stockPcs) * 100) / 100 : m.soldPcs > 0 ? 99 : 0, movement: m.soldPcs === 0 ? "Dead / no sale" : m.stockPcs === 0 || m.soldPcs / Math.max(1, m.stockPcs) >= 1 ? "Fast" : m.soldPcs / Math.max(1, m.stockPcs) >= 0.25 ? "Normal" : "Slow" }))
          .sort((a, b) => b.soldPcs - a.soldPcs);
        return {
          title: byShade ? "Fast & slow movers by shade" : "Fast & slow movers by size",
          columns: [
            { key: "name", label: byShade ? "Product" : "Size", type: "text" },
            ...(byShade ? [{ key: "detail", label: "Shade", type: "text" as ColType }] : []),
            { key: "soldPcs", label: "Sold (pcs)", type: "number" },
            { key: "stockPcs", label: "In stock (pcs)", type: "number" },
            { key: "turnover", label: "Sold / stock", type: "number" },
            { key: "ageDays", label: "Oldest lot (days)", type: "number" },
            { key: "movement", label: "Movement", type: "text" },
          ],
          rows,
        };
      }
      case "breakage": {
        const rows0 = await this.prisma.breakageEntry.findMany({
          where: { deletedAt: null, status: { not: "CANCELLED" }, date: { gte: from, lte: to }, ...(q.branchId ? { branchId: q.branchId } : {}) },
          select: { stage: true, qtyPcs: true, reason: true, product: { select: { name: true, sku: true, brand: { select: { name: true } } } }, batch: { select: { landedCostPaise: true, purchaseRatePaise: true } } },
        });
        const map = new Map<string, { brand: string; stage: string; entries: number; qtyPcs: number; costPaise: number }>();
        for (const r of rows0) {
          const k = `${r.product.brand.name}|${r.stage}`;
          const m = map.get(k) ?? { brand: r.product.brand.name, stage: r.stage, entries: 0, qtyPcs: 0, costPaise: 0 };
          m.entries++;
          m.qtyPcs += r.qtyPcs;
          m.costPaise += r.qtyPcs * (n(r.batch.landedCostPaise) || n(r.batch.purchaseRatePaise));
          map.set(k, m);
        }
        const rows = [...map.values()].sort((a, b) => b.qtyPcs - a.qtyPcs);
        const cols: ReportResult["columns"] = [
          { key: "brand", label: "Brand", type: "text" },
          { key: "stage", label: "Stage", type: "text" },
          { key: "entries", label: "Entries", type: "number" },
          { key: "qtyPcs", label: "Broken (pcs)", type: "number" },
        ];
        if (user.permissions.has("cost.read")) cols.push({ key: "costPaise", label: "Cost value", type: "money" });
        return { title: "Breakage summary", columns: cols, rows, totals: sumCols(rows, ["entries", "qtyPcs", "costPaise"]) };
      }
      case "scheme-progress": {
        const schemes = await this.prisma.scheme.findMany({ where: { deletedAt: null, isActive: true }, include: { brand: true, slabs: { orderBy: { threshold: "asc" } } } });
        const rows = [];
        for (const s of schemes) {
          const lines = await this.prisma.purchaseInvoiceLine.findMany({
            where: { deletedAt: null, product: { brandId: s.brandId }, purchaseInvoice: { status: "POSTED", deletedAt: null, date: { gte: s.periodFrom, lte: s.periodTo } } },
            select: { qtyPcs: true, taxablePaise: true, product: { select: { pcsPerBox: true, sqftPerBox: true } } },
          });
          const achieved =
            s.targetType === "VALUE"
              ? lines.reduce((a, l) => a + n(l.taxablePaise), 0)
              : Math.round(lines.reduce((a, l) => a + (l.product.pcsPerBox && l.product.sqftPerBox ? (l.qtyPcs * l.product.sqftPerBox) / l.product.pcsPerBox : 0), 0));
          const reached = s.slabs.filter((sl) => achieved >= n(sl.threshold)).pop();
          const next = s.slabs.find((sl) => achieved < n(sl.threshold));
          const value = lines.reduce((a, l) => a + n(l.taxablePaise), 0);
          rows.push({
            name: `${s.brand.name} · ${s.name}`,
            targetType: s.targetType,
            achieved: s.targetType === "VALUE" ? achieved / 100 : achieved,
            nextTarget: next ? (s.targetType === "VALUE" ? n(next.threshold) / 100 : n(next.threshold)) : null,
            rebatePct: reached?.rebatePct ?? 0,
            expectedRebatePaise: Math.round((value * (reached?.rebatePct ?? 0)) / 100),
            periodTo: s.periodTo,
          });
        }
        return {
          title: "Brand scheme progress",
          columns: [
            { key: "name", label: "Scheme", type: "text" },
            { key: "targetType", label: "Target in", type: "text" },
            { key: "achieved", label: "Achieved (₹ or sq ft)", type: "number" },
            { key: "nextTarget", label: "Next slab at", type: "number" },
            { key: "rebatePct", label: "Rebate %", type: "pct" },
            { key: "expectedRebatePaise", label: "Expected rebate", type: "money" },
            { key: "periodTo", label: "Ends", type: "date" },
          ],
          rows,
        };
      }
      case "influencer-performance": {
        const infs = await this.prisma.influencer.findMany({ where: { deletedAt: null } });
        const inv = await this.prisma.invoice.groupBy({ by: ["influencerId"], where: { ...invWhere, influencerId: { not: null } }, _sum: { taxablePaise: true, totalPaise: true, paidPaise: true }, _count: true });
        const led = await this.prisma.influencerLedger.groupBy({ by: ["influencerId", "kind"], where: { deletedAt: null, createdAt: { gte: from, lte: to } }, _sum: { amountPaise: true, points: true } });
        const rows = infs
          .map((i) => {
            const g = inv.find((x) => x.influencerId === i.id);
            const acc = led.filter((l) => l.influencerId === i.id && l.kind !== "PAYOUT");
            const pay = led.find((l) => l.influencerId === i.id && l.kind === "PAYOUT");
            return {
              name: i.name,
              type: i.type,
              invoices: g?._count ?? 0,
              salesPaise: n(g?._sum.taxablePaise),
              collectedPaise: n(g?._sum.paidPaise),
              commissionPaise: acc.reduce((a, l) => a + n(l._sum.amountPaise), 0),
              paidOutPaise: -n(pay?._sum.amountPaise),
              pointsBalance: i.pointsBalance,
            };
          })
          .sort((a, b) => b.salesPaise - a.salesPaise);
        return {
          title: "Influencer performance",
          columns: [
            { key: "name", label: "Influencer", type: "text" },
            { key: "type", label: "Type", type: "text" },
            { key: "invoices", label: "Invoices", type: "number" },
            { key: "salesPaise", label: "Sales (taxable)", type: "money" },
            { key: "collectedPaise", label: "Collected", type: "money" },
            { key: "commissionPaise", label: "Commission earned", type: "money" },
            { key: "paidOutPaise", label: "Paid out", type: "money" },
            { key: "pointsBalance", label: "Points balance", type: "number" },
          ],
          rows,
          totals: sumCols(rows, ["invoices", "salesPaise", "collectedPaise", "commissionPaise", "paidOutPaise"]),
        };
      }
      case "outstanding-summary": {
        const inv = await this.prisma.invoice.findMany({
          where: { status: "POSTED", deletedAt: null, ...(q.branchId ? { branchId: q.branchId } : {}) },
          select: { date: true, totalPaise: true, paidPaise: true, party: { select: { segment: true } } },
        });
        const map = new Map<string, Record<string, number>>();
        for (const i of inv) {
          const due = n(i.totalPaise) - n(i.paidPaise);
          if (due <= 0) continue;
          const seg = i.party.segment;
          const m = map.get(seg) ?? { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0, total: 0, invoices: 0 };
          m[ageingBucket(daysBetween(i.date))] += due;
          m.total += due;
          m.invoices++;
          map.set(seg, m);
        }
        const rows = [...map.entries()].map(([segment, m]) => ({ segment, invoices: m.invoices, b0: m["0-30"], b31: m["31-60"], b61: m["61-90"], b90: m["90+"], total: m.total }));
        return {
          title: "Outstanding summary (ageing)",
          columns: [
            { key: "segment", label: "Segment", type: "text" },
            { key: "invoices", label: "Open invoices", type: "number" },
            { key: "b0", label: "0–30 days", type: "money" },
            { key: "b31", label: "31–60 days", type: "money" },
            { key: "b61", label: "61–90 days", type: "money" },
            { key: "b90", label: "90+ days", type: "money" },
            { key: "total", label: "Total", type: "money" },
          ],
          rows,
          totals: sumCols(rows, ["invoices", "b0", "b31", "b61", "b90", "total"]),
        };
      }
    }
    throw new BadRequestException("Unknown report");
  }
}

function sumCols(rows: Record<string, unknown>[], keys: string[]) {
  const out: Record<string, number> = {};
  for (const k of keys) {
    if (!rows.some((r) => typeof r[k] === "number")) continue;
    out[k] = rows.reduce((a, r) => a + (typeof r[k] === "number" ? (r[k] as number) : 0), 0);
  }
  return out;
}
