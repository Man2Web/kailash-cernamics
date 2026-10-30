"use client";

import { formatDate, formatINR, labelOf } from "@gc/shared";
import { PageHeader } from "@/components/common/page-header";
import { DataTable, type DataColumn, type FilterDef } from "@/components/common/data-table";
import { useApi } from "@/lib/api";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

interface ShadeRow {
  id: string;
  batchNo: string;
  shadeCode: string;
  caliber: string;
  grade: string;
  product: { id: string; sku: string; name: string; brand: { name: string }; size: { name: string } | null; finish: { name: string } | null };
  availablePcs: number;
  reservedPcs: number;
  displayPcs: number;
  damagedPcs: number;
  availableText: string;
  sqft: number;
  ageDays: number | null;
  lastSoldAt: string | null;
  valuePaise?: number;
}

type Named = { id: string; name: string };

function ageTone(days: number | null) {
  if (days === null) return "";
  if (days > 180) return "text-ios-red font-medium";
  if (days > 90) return "text-ios-orange font-medium";
  return "";
}

/** Shade-wise stock: one row per lot so slow-moving shades are visible. */
export default function ShadesPage() {
  const { can } = useSession();
  const brands = useApi<{ items: Named[] }>("/brands", { pageSize: 200, sort: "name" });
  const sizes = useApi<{ items: Named[] }>("/sizes", { pageSize: 200, sort: "name" });
  const finishes = useApi<{ items: Named[] }>("/finishes", { pageSize: 200, sort: "name" });

  const filters: FilterDef[] = [
    { key: "brandId", label: "Brand", options: (brands.data?.items ?? []).map((b) => ({ value: b.id, label: b.name })) },
    { key: "sizeId", label: "Size", options: (sizes.data?.items ?? []).map((b) => ({ value: b.id, label: b.name })) },
    { key: "finishId", label: "Finish", options: (finishes.data?.items ?? []).map((b) => ({ value: b.id, label: b.name })) },
    { key: "minAgeDays", label: "Age", options: [{ value: "90", label: "Over 90 days" }, { value: "180", label: "Over 180 days" }, { value: "365", label: "Over 1 year" }] },
    { key: "onlyAvailable", label: "Show", options: [{ value: "false", label: "Include empty lots" }] },
  ];

  const columns: DataColumn<ShadeRow>[] = [
    {
      id: "product",
      header: "Product",
      meta: { sortKey: "product.name", exportValue: (r) => r.product.name, exportHeader: "Product" },
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="font-medium">{row.original.product.name}</div>
          <div className="text-[12px] text-muted-foreground">
            {row.original.product.sku} · {row.original.product.brand.name}
            {row.original.product.size ? ` · ${row.original.product.size.name}` : ""}
          </div>
        </div>
      ),
    },
    { accessorKey: "shadeCode", header: "Shade", meta: { sortKey: "shadeCode" }, cell: ({ row }) => <span className="font-semibold">{row.original.shadeCode}</span> },
    { accessorKey: "batchNo", header: "Lot" },
    { accessorKey: "caliber", header: "Caliber" },
    { accessorKey: "grade", header: "Grade", cell: ({ row }) => labelOf(row.original.grade), meta: { exportValue: (r) => labelOf(r.grade) } },
    { id: "available", header: "Available", meta: { sortKey: "availablePcs", align: "right", exportValue: (r) => r.availableText }, cell: ({ row }) => <span className="whitespace-nowrap">{row.original.availableText}</span> },
    { id: "sqft", header: "Sq ft", meta: { sortKey: "sqft", align: "right", exportValue: (r) => Math.round(r.sqft) }, cell: ({ row }) => Math.round(row.original.sqft).toLocaleString("en-IN") },
    { id: "reserved", header: "Reserved (pcs)", meta: { align: "right", exportValue: (r) => r.reservedPcs }, cell: ({ row }) => row.original.reservedPcs || "—" },
    { id: "display", header: "Display / damaged (pcs)", meta: { align: "right", exportValue: (r) => `${r.displayPcs} / ${r.damagedPcs}` }, cell: ({ row }) => `${row.original.displayPcs || "—"} / ${row.original.damagedPcs || "—"}` },
    {
      id: "age",
      header: "Age",
      meta: { sortKey: "ageDays", align: "right", exportValue: (r) => r.ageDays },
      cell: ({ row }) => <span className={cn("tabular", ageTone(row.original.ageDays))}>{row.original.ageDays === null ? "—" : `${row.original.ageDays} d`}</span>,
    },
    { id: "lastSold", header: "Last sold", meta: { sortKey: "lastSoldAt", exportValue: (r) => formatDate(r.lastSoldAt) }, cell: ({ row }) => (row.original.lastSoldAt ? formatDate(row.original.lastSoldAt) : <span className="text-muted-foreground">Never</span>) },
    ...(can("cost.read")
      ? [{ id: "value", header: "Value (landed)", meta: { align: "right" as const, exportValue: (r: ShadeRow) => (r.valuePaise ?? 0) / 100 }, cell: ({ row }: { row: { original: ShadeRow } }) => formatINR(row.original.valuePaise ?? 0) }]
      : []),
  ];

  return (
    <>
      <PageHeader title="Shade-wise stock" description="Every shade lot with its caliber, grade and age. Old lots in amber and red are the ones to push or clear." />
      <DataTable<ShadeRow>
        endpoint="/stock/shades"
        columns={columns}
        filters={filters}
        exportName="shade-wise-stock"
        searchPlaceholder="Search product, SKU, shade or lot…"
        rowHref={(r) => `/inventory/stock/${r.product.id}`}
        storageKey="shades"
      />
    </>
  );
}
