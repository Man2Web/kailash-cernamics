"use client";

import { useState } from "react";
import { formatDate, formatINR, formatQty } from "@gc/shared";
import { PageHeader } from "@/components/common/page-header";
import { DataTable } from "@/components/common/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { useApi } from "@/lib/api";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

type P = { id: string; sku: string; name: string; uomType: string; unitName: string | null; pcsPerBox: number | null; sqftPerBox: number | null; brand?: { name: string } };
const productCell = (p: P) => (
  <div>
    <div className="font-medium">{p.name}</div>
    <div className="text-[12px] text-muted-foreground">
      {p.sku}
      {p.brand ? ` · ${p.brand.name}` : ""}
    </div>
  </div>
);

function LowStock() {
  return (
    <DataTable<P & { available: number; reorderLevelPcs: number; shortPcs: number; availableText: string; reorderText: string }>
      endpoint="/stock/low"
      exportName="low-stock"
      rowHref={(r) => `/inventory/stock/${r.id}`}
      emptyTitle="Nothing below reorder level"
      columns={[
        { id: "product", header: "Product", meta: { exportValue: (r) => `${r.sku} ${r.name}` }, cell: ({ row }) => productCell(row.original) },
        { accessorKey: "availableText", header: "Available", cell: ({ row }) => <span className={cn("font-medium", row.original.available <= 0 ? "text-ios-red" : "text-ios-orange")}>{row.original.availableText}</span> },
        { accessorKey: "reorderText", header: "Reorder level" },
        { accessorKey: "shortPcs", header: "Short by", meta: { exportValue: (r) => r.shortPcs }, cell: ({ row }) => formatQty(row.original.shortPcs, row.original) },
      ]}
    />
  );
}

function DeadStock() {
  const [days, setDays] = useState(180);
  return (
    <DataTable<P & { lastOutAt: string | null; idleDays: number | null; stockText: string }>
      endpoint="/stock/dead"
      params={{ days }}
      exportName="dead-stock"
      rowHref={(r) => `/inventory/stock/${r.id}`}
      emptyTitle="No dead stock"
      toolbar={
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-9 rounded-md bg-fill px-2 text-[13px]" aria-label="Idle days">
          {[30, 60, 90, 180, 365].map((d) => (
            <option key={d} value={d}>
              No sale in {d} days
            </option>
          ))}
        </select>
      }
      columns={[
        { id: "product", header: "Product", meta: { exportValue: (r) => `${r.sku} ${r.name}` }, cell: ({ row }) => productCell(row.original) },
        { accessorKey: "stockText", header: "In stock" },
        { accessorKey: "lastOutAt", header: "Last sold / out", meta: { exportValue: (r) => (r.lastOutAt ? formatDate(r.lastOutAt) : "Never") }, cell: ({ row }) => (row.original.lastOutAt ? formatDate(row.original.lastOutAt) : "Never") },
        { accessorKey: "idleDays", header: "Idle days", meta: { align: "right" } },
      ]}
    />
  );
}

function Ageing() {
  const summary = useApi<{ buckets: Record<string, { qtyPcs: number; valuePaise: number; batches: number }> }>("/stock/ageing", { pageSize: 1 });
  const { can } = useSession();
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {["0-30", "31-60", "61-90", "90+"].map((b) => {
          const v = summary.data?.buckets[b];
          return (
            <div key={b} className="rounded-xl bg-card p-3 shadow-card">
              <div className="text-[12px] text-muted-foreground">{b} days</div>
              <div className="text-[18px] font-semibold tabular">{v?.batches ?? 0} batches</div>
              {can("cost.read") && <div className="text-[12px] text-muted-foreground tabular">{formatINR(v?.valuePaise ?? 0)}</div>}
            </div>
          );
        })}
      </div>
      <DataTable<{ id: string; product: P; batch: { batchNo: string; shadeCode: string }; ageDays: number; bucket: string; text: string; valuePaise?: number }>
        endpoint="/stock/ageing"
        exportName="stock-ageing"
        columns={[
          { id: "product", header: "Product", meta: { exportValue: (r) => `${r.product.sku} ${r.product.name}` }, cell: ({ row }) => productCell(row.original.product) },
          { id: "shade", header: "Shade / batch", meta: { exportValue: (r) => `${r.batch.shadeCode} ${r.batch.batchNo}` }, cell: ({ row }) => (row.original.batch.batchNo === "DEFAULT" ? "—" : `${row.original.batch.shadeCode} · ${row.original.batch.batchNo}`) },
          { accessorKey: "text", header: "Quantity" },
          { accessorKey: "ageDays", header: "Age (days)", meta: { align: "right" } },
          { accessorKey: "bucket", header: "Bucket", cell: ({ row }) => <StatusBadge status={row.original.bucket === "90+" ? "OVERDUE" : row.original.bucket === "61-90" ? "PENDING" : "POSTED"} label={row.original.bucket} /> },
          ...(can("cost.read") ? [{ accessorKey: "valuePaise", header: "Value", meta: { align: "right" as const }, cell: ({ row }: any) => formatINR(row.original.valuePaise ?? 0) }] : []),
        ]}
      />
    </div>
  );
}

function StockValue() {
  const totals = useApi<{ totalValuePaise: number; damagedValuePaise: number }>("/stock/value", { pageSize: 1 });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-card p-3 shadow-card">
          <div className="text-[12px] text-muted-foreground">Stock value (landed cost)</div>
          <div className="text-[20px] font-semibold tabular">{formatINR(totals.data?.totalValuePaise ?? 0)}</div>
        </div>
        <div className="rounded-xl bg-card p-3 shadow-card">
          <div className="text-[12px] text-muted-foreground">Damaged stock value</div>
          <div className="text-[20px] font-semibold text-ios-red tabular">{formatINR(totals.data?.damagedValuePaise ?? 0)}</div>
        </div>
      </div>
      <DataTable<P & { qtyPcs: number; valuePaise: number; damagedPcs: number; damagedValuePaise: number; text: string }>
        endpoint="/stock/value"
        exportName="stock-value"
        rowHref={(r) => `/inventory/stock/${r.id}`}
        columns={[
          { id: "product", header: "Product", meta: { exportValue: (r) => `${r.sku} ${r.name}` }, cell: ({ row }) => productCell(row.original) },
          { accessorKey: "text", header: "Saleable + display" },
          { accessorKey: "valuePaise", header: "Value", meta: { align: "right", exportValue: (r) => r.valuePaise / 100 }, cell: ({ row }) => formatINR(row.original.valuePaise) },
          { accessorKey: "damagedValuePaise", header: "Damaged value", meta: { align: "right", exportValue: (r) => r.damagedValuePaise / 100 }, cell: ({ row }) => (row.original.damagedValuePaise ? formatINR(row.original.damagedValuePaise) : "—") },
        ]}
      />
    </div>
  );
}

export default function LowStockPage() {
  const { can } = useSession();
  const tabs = [
    { key: "low", label: "Low stock" },
    { key: "dead", label: "Dead stock" },
    { key: "ageing", label: "Ageing" },
    ...(can("cost.read") ? [{ key: "value", label: "Stock value" }] : []),
  ];
  const [tab, setTab] = useState("low");
  return (
    <>
      <PageHeader title="Low & dead stock" description="Reorder alerts, slow movers, stock age by batch and stock value." />
      <div className="mb-3 inline-flex flex-wrap gap-1 rounded-lg bg-fill p-1">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={cn("rounded-md px-3 py-1.5 text-[13px] font-medium", tab === t.key ? "bg-[var(--segment-on)] shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "low" && <LowStock />}
      {tab === "dead" && <DeadStock />}
      {tab === "ageing" && <Ageing />}
      {tab === "value" && <StockValue />}
    </>
  );
}
