"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Boxes,
  CalendarClock,
  CheckCheck,
  FilePlus2,
  HandCoins,
  IndianRupee,
  PackageX,
  ReceiptIndianRupee,
  RefreshCcw,
  TrendingUp,
  UserPlus,
} from "lucide-react";
import { formatBoxes, formatDateTime, formatINR, labelOf } from "@gc/shared";
import { PageHeader, Section } from "@/components/common/page-header";
import { EmptyState, ErrorState, LoadingPage } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { BarList, KpiTile } from "@/components/dashboard/kpi";
import { AttendanceTodayCard } from "@/components/office/attendance-today-card";
import { useApi } from "@/lib/api";
import { useSession } from "@/lib/session";

interface Dashboard {
  salesTodayPaise: number;
  invoicesToday: number;
  salesMonthPaise: number;
  invoicesMonth: number;
  receiptsTodayPaise: number;
  outstandingPaise: number;
  overduePaise: number;
  stockValuePaise: number | null;
  pendingApprovals: number;
  tally: { pending: number; failed: number; agents: number; silentAgents: string[]; lastSeenAt: string | null } | null;
  topBrands: { name: string; valuePaise: number }[];
  lowStockCount: number;
  lowStock: { id: string; sku: string; name: string; reorderLevelPcs: number; availablePcs: number; pcsPerBox: number | null }[];
  followups: { id: string; dueAt: string; notes: string | null; lead: { id: string; name: string; phone: string | null; status: string } }[];
}

/** Compact rupees for tiles: ₹12.4 L, ₹1.2 Cr. */
function short(paise: number) {
  const r = paise / 100;
  if (Math.abs(r) >= 1e7) return `₹${(r / 1e7).toFixed(2)} Cr`;
  if (Math.abs(r) >= 1e5) return `₹${(r / 1e5).toFixed(2)} L`;
  return formatINR(paise).replace(/\.00$/, "");
}

export default function DashboardPage() {
  const { user, branch, can, on } = useSession();
  const q = useApi<Dashboard>("/dashboard", undefined, { refetchInterval: 120_000 });
  const greeting = (() => {
    const h = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
    return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  })();

  const actions = (
    <>
      {on("sales.quotations") && can("quotation.write") && (
        <Button asChild size="sm">
          <Link href="/sales/quotations/new">
            <FilePlus2 className="size-4" /> New quotation
          </Link>
        </Button>
      )}
      {on("sales.invoices") && can("invoice.write") && (
        <Button asChild size="sm" variant="secondary">
          <Link href="/sales/invoices/new">New invoice</Link>
        </Button>
      )}
      {on("accounts.receipts") && can("receipt.write") && (
        <Button asChild size="sm" variant="secondary">
          <Link href="/accounts/receipts/new">New receipt</Link>
        </Button>
      )}
      {on("crm.leads") && can("crm.write") && (
        <Button asChild size="sm" variant="secondary">
          <Link href="/crm/leads/new">
            <UserPlus className="size-4" /> New lead
          </Link>
        </Button>
      )}
    </>
  );

  if (q.isLoading) return <LoadingPage />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const d = q.data;
  const tallyTone = !d.tally ? "gray" : d.tally.failed > 0 || d.tally.silentAgents.length ? "red" : d.tally.pending > 0 ? "orange" : "green";

  return (
    <>
      <PageHeader title={`${greeting}, ${user.name.split(" ")[0]}`} description={branch ? `${branch.name} (${branch.code})` : undefined} actions={actions} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {on("sales") && <KpiTile label="Sales today" value={short(d.salesTodayPaise)} sub={`${d.invoicesToday} invoice${d.invoicesToday === 1 ? "" : "s"} · collected ${short(d.receiptsTodayPaise)}`} icon={IndianRupee} tone="green" href="/sales/invoices" />}
        {on("sales") && <KpiTile label="Sales this month" value={short(d.salesMonthPaise)} sub={`${d.invoicesMonth} invoices`} icon={TrendingUp} tone="blue" href="/reports" />}
        {on("accounts") && <KpiTile label="Outstanding" value={short(d.outstandingPaise)} sub={<span className={d.overduePaise ? "text-ios-red" : undefined}>{short(d.overduePaise)} overdue</span>} icon={HandCoins} tone={d.overduePaise ? "orange" : "teal"} href="/accounts/outstanding" />}
        {!on("inventory") ? null : d.stockValuePaise !== null ? (
          <KpiTile label="Stock value (landed)" value={short(d.stockValuePaise)} sub={`${d.lowStockCount} items low`} icon={Boxes} tone="indigo" href="/inventory/stock" />
        ) : (
          <KpiTile label="Low stock items" value={d.lowStockCount} sub="at or below reorder level" icon={PackageX} tone="orange" href="/inventory/low-stock" />
        )}
        <KpiTile label="Pending approvals" value={d.pendingApprovals} sub="discount, credit, stock" icon={CheckCheck} tone={d.pendingApprovals ? "orange" : "gray"} href="/approvals" />
        {d.tally && (
          <KpiTile
            label="Tally sync"
            value={d.tally.failed ? `${d.tally.failed} failed` : d.tally.pending ? `${d.tally.pending} pending` : "Up to date"}
            sub={d.tally.agents ? (d.tally.silentAgents.length ? `Agent silent: ${d.tally.silentAgents.join(", ")}` : `Agent seen ${formatDateTime(d.tally.lastSeenAt)}`) : "No agent set up"}
            icon={RefreshCcw}
            tone={tallyTone}
            href="/settings/tally"
          />
        )}
        {on("crm") && <KpiTile label="Follow-ups due" value={d.followups.length} sub="today and overdue" icon={CalendarClock} tone={d.followups.length ? "blue" : "gray"} href="/crm/followups" />}
        {on("accounts") && <KpiTile label="Receipts today" value={short(d.receiptsTodayPaise)} icon={ReceiptIndianRupee} tone="teal" href="/accounts/receipts" />}
      </div>

      {on("office") && <AttendanceTodayCard />}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {on("sales") && <Section title="Top brands this month">
          {d.topBrands.length ? <BarList items={d.topBrands.map((b) => ({ name: b.name, value: b.valuePaise }))} format={short} /> : <EmptyState title="No sales yet this month" className="py-6" />}
        </Section>}
        {on("inventory") && <Section title="Low stock" actions={<Link href="/inventory/low-stock" className="text-[13px] text-tint hover:underline">View all</Link>}>
          {d.lowStock.length ? (
            <ul className="divide-y divide-border">
              {d.lowStock.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-[13px]">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{p.name}</div>
                    <div className="text-[12px] text-muted-foreground">{p.sku}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={p.availablePcs <= 0 ? "font-medium text-ios-red" : "font-medium text-ios-orange"}>{formatBoxes(p.availablePcs, p.pcsPerBox)}</div>
                    <div className="text-[11px] text-muted-foreground">reorder at {formatBoxes(p.reorderLevelPcs, p.pcsPerBox)}</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Stock is healthy" className="py-6" />
          )}
        </Section>}
        {on("crm") && <Section title="Today's follow-ups" actions={<Link href="/crm/followups" className="text-[13px] text-tint hover:underline">Open</Link>}>
          {d.followups.length ? (
            <ul className="divide-y divide-border">
              {d.followups.map((f) => {
                const overdue = new Date(f.dueAt) < new Date(new Date().toDateString());
                return (
                  <li key={f.id} className="flex items-center justify-between gap-2 py-2 text-[13px]">
                    <Link href={`/crm/leads/${f.lead.id}`} className="min-w-0 hover:underline">
                      <div className="truncate font-medium">{f.lead.name}</div>
                      <div className="truncate text-[12px] text-muted-foreground">{f.notes || f.lead.phone}</div>
                    </Link>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <StatusBadge status={f.lead.status} />
                      {overdue && (
                        <span className="flex items-center gap-1 text-[11px] text-ios-red">
                          <AlertTriangle className="size-3" /> overdue
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState title="No follow-ups due" className="py-6" />
          )}
        </Section>}
      </div>
      <p className="mt-4 text-[12px] text-muted-foreground">{labelOf(user.role.code)} view · figures for the selected branch · refreshed every 2 minutes</p>
    </>
  );
}
