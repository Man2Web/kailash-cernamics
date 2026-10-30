"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { formatDate, formatIndian, formatINR, labelOf, toDateInput } from "@gc/shared";
import { PageHeader, Section } from "@/components/common/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { NativeSelect } from "@/components/common/form-fields";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useApi } from "@/lib/api";
import { useSession } from "@/lib/session";
import { exportToExcel } from "@/lib/export";
import { cn } from "@/lib/utils";

type ColType = "text" | "money" | "number" | "pct" | "date";
interface Report {
  title: string;
  columns: { key: string; label: string; type: ColType }[];
  rows: Record<string, unknown>[];
  totals?: Record<string, number>;
}

function fmt(v: unknown, t: ColType): string {
  if (v === null || v === undefined || v === "") return "—";
  if (t === "money") return formatINR(Number(v));
  if (t === "number") return formatIndian(Number(v), Number.isInteger(Number(v)) ? 0 : 2);
  if (t === "pct") return `${Number(v).toFixed(1)}%`;
  if (t === "date") return formatDate(String(v));
  return labelOf(String(v)) === String(v).toUpperCase() ? String(v) : /^[A-Z_]+$/.test(String(v)) ? labelOf(String(v)) : String(v);
}

export default function ReportsPage() {
  const { branchId, user } = useSession();
  const list = useApi<{ key: string; title: string }[]>("/reports");
  const monthStart = toDateInput(new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12));
  const [name, setName] = useState("sales-by-brand");
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(toDateInput());
  const [allBranches, setAllBranches] = useState(false);
  useEffect(() => {
    if (list.data && !list.data.find((r) => r.key === name)) setName(list.data[0]?.key ?? name);
  }, [list.data, name]);
  const q = useApi<Report>(`/reports/${name}`, { from: `${from}T00:00:00+05:30`, to: `${to}T00:00:00+05:30`, branchId: allBranches ? undefined : branchId });

  const doExport = () => {
    if (!q.data) return;
    exportToExcel(
      `${name}-${from}-to-${to}`,
      q.data.columns.map((c) => ({ header: c.label, key: c.key })),
      q.data.rows.map((r) => Object.fromEntries(q.data!.columns.map((c) => [c.key, c.type === "money" ? Number(r[c.key] ?? 0) / 100 : c.type === "date" ? formatDate(String(r[c.key] ?? "")) : r[c.key]]))),
    );
  };

  return (
    <>
      <PageHeader title="Reports" description="Sales, margin, movers, breakage, schemes, influencers and outstanding. All exportable to Excel." />
      <Section className="mb-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-end">
          <label className="flex flex-1 flex-col gap-1 text-[12px] text-muted-foreground">
            Report
            <NativeSelect value={name} onChange={(e) => setName(e.target.value)}>
              {(list.data ?? []).map((r) => <option key={r.key} value={r.key}>{r.title}</option>)}
            </NativeSelect>
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-muted-foreground">From<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="flex flex-col gap-1 text-[12px] text-muted-foreground">To<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          {user.branches.length > 1 && (
            <label className="flex h-9 items-center gap-2 text-[13px]"><input type="checkbox" checked={allBranches} onChange={(e) => setAllBranches(e.target.checked)} /> All branches</label>
          )}
          <Button variant="secondary" onClick={doExport} disabled={!q.data?.rows.length}><Download className="size-4" /> Excel</Button>
        </div>
      </Section>
      <Section title={q.data?.title}>
        {q.isLoading ? (
          <LoadingRows />
        ) : q.isError ? (
          <ErrorState error={q.error} retry={() => q.refetch()} />
        ) : !q.data?.rows.length ? (
          <EmptyState title="No data for this period" />
        ) : (
          <div className="max-h-[65vh] overflow-auto">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border">
                  {q.data.columns.map((c) => (
                    <th key={c.key} className={cn("h-9 px-2 text-left text-[12px] font-medium whitespace-nowrap text-muted-foreground", c.type !== "text" && "text-right")}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {q.data.rows.map((r, i) => (
                  <tr key={i} className="border-b border-border/60">
                    {q.data!.columns.map((c, j) => (
                      <td key={c.key} className={cn("h-9 px-2", c.type !== "text" && c.type !== "date" && "text-right tabular", j === 0 && "font-medium")}>{fmt(r[c.key], c.type)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {q.data.totals && (
                <tfoot>
                  <tr className="font-semibold">
                    {q.data.columns.map((c, j) => (
                      <td key={c.key} className={cn("h-9 px-2", c.type !== "text" && "text-right tabular")}>{j === 0 ? "Total" : q.data!.totals![c.key] !== undefined ? fmt(q.data!.totals![c.key], c.type) : ""}</td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </Section>
    </>
  );
}
