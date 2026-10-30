"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { formatDate, formatINR } from "@gc/shared";
import { PageHeader } from "@/components/common/page-header";
import { DataTable } from "@/components/common/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Can } from "@/lib/session";

interface Row {
  id: string;
  number: string;
  date: string;
  status: string;
  truckNo: string | null;
  supplierInvoiceNo: string | null;
  totalValuePaise: number;
  supplier: { name: string };
  godown: { name: string };
  po: { number: string } | null;
  _count: { lines: number };
}

export default function GrnListPage() {
  return (
    <>
      <PageHeader
        title="Goods receipt (GRN)"
        description="Receive goods with batch, shade, caliber and grade. Freight and unloading are spread into landed cost."
        actions={
          <Can perm="purchase.write">
            <Button asChild size="sm">
              <Link href="/purchase/grn/new">
                <Plus className="size-4" /> New GRN
              </Link>
            </Button>
          </Can>
        }
      />
      <DataTable<Row>
        endpoint="/grns"
        exportName="grn"
        rowHref={(r) => `/purchase/grn/${r.id}`}
        searchPlaceholder="Search GRN, supplier, truck or invoice no…"
        filters={[{ key: "status", label: "Status", options: [{ value: "DRAFT", label: "Draft" }, { value: "POSTED", label: "Posted" }, { value: "CANCELLED", label: "Cancelled" }] }]}
        columns={[
          { accessorKey: "number", header: "GRN", meta: { className: "whitespace-nowrap" }, cell: ({ row }) => <span className="font-medium">{row.original.number}</span> },
          { accessorKey: "date", header: "Date", meta: { sortKey: "date", className: "whitespace-nowrap", exportValue: (r) => formatDate(r.date) }, cell: ({ row }) => formatDate(row.original.date) },
          { id: "supplier", header: "Supplier", meta: { exportValue: (r) => r.supplier.name }, cell: ({ row }) => row.original.supplier.name },
          { id: "po", header: "PO", meta: { exportValue: (r) => r.po?.number }, cell: ({ row }) => row.original.po?.number ?? "Direct" },
          { accessorKey: "truckNo", header: "Truck", meta: { className: "whitespace-nowrap" } },
          { accessorKey: "supplierInvoiceNo", header: "Supplier inv." },
          { id: "godown", header: "Godown", meta: { exportValue: (r) => r.godown.name }, cell: ({ row }) => row.original.godown.name },
          { accessorKey: "totalValuePaise", header: "Value", meta: { align: "right", exportValue: (r) => r.totalValuePaise / 100 }, cell: ({ row }) => (row.original.totalValuePaise ? formatINR(row.original.totalValuePaise) : "—") },
          { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
        ]}
      />
    </>
  );
}
