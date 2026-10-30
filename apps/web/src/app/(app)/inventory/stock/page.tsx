"use client";

import { formatQty } from "@gc/shared";
import { PageHeader } from "@/components/common/page-header";
import { DataTable } from "@/components/common/data-table";
import { StatusBadge } from "@/components/common/status-badge";

interface Row {
  id: string;
  sku: string;
  name: string;
  uomType: string;
  unitName: string | null;
  pcsPerBox: number | null;
  sqftPerBox: number | null;
  brand: { name: string };
  category: { name: string };
  size: { name: string } | null;
  saleable: number;
  reserved: number;
  available: number;
  display: number;
  damaged: number;
  inTransit: number;
  sample: number;
  availableText: string;
  belowReorder: boolean;
}

const q = (n: number, r: Row) => (n ? formatQty(n, r) : <span className="text-muted-foreground">—</span>);

export default function StockPage() {
  return (
    <>
      <PageHeader title="Stock" description="Available = saleable − reserved. Click a product to see shades, batches and racks." />
      <DataTable<Row>
        endpoint="/stock/summary"
        searchPlaceholder="Search product, SKU, brand or size…"
        filters={[{ key: "inStock", label: "Show", options: [{ value: "true", label: "In stock only" }] }]}
        rowHref={(r) => `/inventory/stock/${r.id}`}
        exportName="stock-summary"
        defaultSort={{ sort: "name", dir: "asc" }}
        columns={[
          {
            accessorKey: "name",
            header: "Product",
            meta: { sortKey: "name" },
            cell: ({ row }) => (
              <div className="min-w-0">
                <div className="truncate font-medium">{row.original.name}</div>
                <div className="text-[12px] text-muted-foreground">
                  {row.original.sku} · {row.original.brand?.name}
                  {row.original.size ? ` · ${row.original.size.name}` : ""}
                </div>
              </div>
            ),
          },
          { accessorKey: "available", header: "Available", meta: { exportValue: (r) => r.availableText }, cell: ({ row }) => <span className="font-medium">{q(row.original.available, row.original)}</span> },
          { accessorKey: "saleable", header: "Saleable", meta: { exportValue: (r) => r.saleable }, cell: ({ row }) => q(row.original.saleable, row.original) },
          { accessorKey: "reserved", header: "Reserved", meta: { exportValue: (r) => r.reserved }, cell: ({ row }) => q(row.original.reserved, row.original) },
          { accessorKey: "display", header: "Display", meta: { exportValue: (r) => r.display }, cell: ({ row }) => q(row.original.display, row.original) },
          { accessorKey: "damaged", header: "Damaged", meta: { exportValue: (r) => r.damaged }, cell: ({ row }) => q(row.original.damaged, row.original) },
          { accessorKey: "inTransit", header: "In transit", meta: { exportValue: (r) => r.inTransit }, cell: ({ row }) => (row.original.inTransit ? q(row.original.inTransit, row.original) : "—") },
          { accessorKey: "sample", header: "Samples out", meta: { exportValue: (r) => r.sample }, cell: ({ row }) => (row.original.sample ? q(row.original.sample, row.original) : "—") },
          {
            id: "alert",
            header: "Alert",
            meta: { exportValue: (r) => (r.belowReorder ? "Low stock" : "") },
            cell: ({ row }) => (row.original.belowReorder ? <StatusBadge status="OVERDUE" label="Low stock" /> : null),
          },
        ]}
      />
    </>
  );
}
