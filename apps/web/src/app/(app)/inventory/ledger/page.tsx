"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { formatDateTime, formatINR, labelOf } from "@gc/shared";
import { PageHeader } from "@/components/common/page-header";
import { DataTable } from "@/components/common/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/session";

interface Row {
  id: string;
  postedAt: string;
  qtyPcs: number;
  text: string;
  stockType: string;
  refType: string;
  refId: string;
  note: string | null;
  ratePaise?: number;
  product: { sku: string; name: string };
  batch: { batchNo: string; shadeCode: string };
  godown: { name: string };
  rack: { code: string } | null;
}

const REF_TYPES = ["GRN", "GRN_CANCEL", "TRANSFER", "TRANSFER_CANCEL", "ADJUSTMENT", "BREAKAGE", "WRITE_OFF", "DEBIT_NOTE", "INVOICE", "CHALLAN", "SALES_RETURN", "RESERVATION"];

function LedgerTable() {
  const sp = useSearchParams();
  const { can } = useSession();
  const productId = sp.get("productId") ?? undefined;
  return (
    <DataTable<Row>
      endpoint="/stock/ledger"
      params={{ productId }}
      searchPlaceholder="Search product, SKU or shade…"
      filters={[
        { key: "refType", label: "Type", options: REF_TYPES.map((t) => ({ value: t, label: labelOf(t) })) },
      ]}
      exportName="stock-ledger"
      columns={[
        { accessorKey: "postedAt", header: "Date", meta: { sortKey: "postedAt", exportValue: (r) => formatDateTime(r.postedAt) }, cell: ({ row }) => <span className="whitespace-nowrap">{formatDateTime(row.original.postedAt)}</span> },
        {
          id: "product",
          header: "Product",
          meta: { exportValue: (r) => `${r.product.sku} ${r.product.name}` },
          cell: ({ row }) => (
            <div>
              <div className="font-medium">{row.original.product.name}</div>
              <div className="text-[12px] text-muted-foreground">{row.original.product.sku}</div>
            </div>
          ),
        },
        { id: "shade", header: "Shade / batch", meta: { exportValue: (r) => `${r.batch.shadeCode} ${r.batch.batchNo}` }, cell: ({ row }) => (row.original.batch.batchNo === "DEFAULT" ? "—" : `${row.original.batch.shadeCode} · ${row.original.batch.batchNo}`) },
        { id: "where", header: "Godown / rack", meta: { exportValue: (r) => `${r.godown.name} ${r.rack?.code ?? ""}` }, cell: ({ row }) => `${row.original.godown.name}${row.original.rack ? ` · ${row.original.rack.code}` : ""}` },
        { accessorKey: "stockType", header: "Stock type", cell: ({ row }) => <StatusBadge status={row.original.stockType} /> },
        {
          accessorKey: "qtyPcs",
          header: "Qty",
          meta: { align: "right", exportValue: (r) => r.qtyPcs },
          cell: ({ row }) => <span className={cn("font-medium tabular", row.original.qtyPcs < 0 ? "text-ios-red" : "text-ios-green")}>{row.original.qtyPcs > 0 ? "+" : ""}{row.original.text}</span>,
        },
        { accessorKey: "refType", header: "Reference", cell: ({ row }) => labelOf(row.original.refType) },
        ...(can("cost.read") ? [{ accessorKey: "ratePaise", header: "Rate / pc", meta: { align: "right" as const }, cell: ({ row }: any) => (row.original.ratePaise ? formatINR(row.original.ratePaise) : "—") }] : []),
        { accessorKey: "note", header: "Note" },
      ]}
    />
  );
}

export default function LedgerPage() {
  return (
    <>
      <PageHeader title="Stock ledger" description="Every stock movement. Balances only change through these rows." />
      <Suspense>
        <LedgerTable />
      </Suspense>
    </>
  );
}
