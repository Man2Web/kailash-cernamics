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
  expectedDate: string | null;
  status: string;
  totalPaise: number;
  supplier: { name: string };
  _count: { lines: number };
}

const STATUSES = [
  { value: "DRAFT", label: "Draft" },
  { value: "APPROVED", label: "Open" },
  { value: "PARTIAL", label: "Partly received" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

export default function PurchaseOrdersPage() {
  return (
    <>
      <PageHeader
        title="Purchase orders"
        actions={
          <Can perm="purchase.write">
            <Button asChild size="sm">
              <Link href="/purchase/orders/new">
                <Plus className="size-4" /> New PO
              </Link>
            </Button>
          </Can>
        }
      />
      <DataTable<Row>
        endpoint="/purchase-orders"
        exportName="purchase-orders"
        rowHref={(r) => `/purchase/orders/${r.id}`}
        searchPlaceholder="Search PO number or supplier…"
        filters={[{ key: "status", label: "Status", options: STATUSES }]}
        columns={[
          { accessorKey: "number", header: "PO", meta: { className: "whitespace-nowrap" }, cell: ({ row }) => <span className="font-medium">{row.original.number}</span> },
          { accessorKey: "date", header: "Date", meta: { sortKey: "date", className: "whitespace-nowrap", exportValue: (r) => formatDate(r.date) }, cell: ({ row }) => formatDate(row.original.date) },
          { id: "supplier", header: "Supplier", meta: { exportValue: (r) => r.supplier.name }, cell: ({ row }) => row.original.supplier.name },
          { accessorKey: "expectedDate", header: "Expected", meta: { exportValue: (r) => formatDate(r.expectedDate) }, cell: ({ row }) => formatDate(row.original.expectedDate) || "—" },
          { accessorKey: "totalPaise", header: "Total", meta: { align: "right", sortKey: "totalPaise", exportValue: (r) => r.totalPaise / 100 }, cell: ({ row }) => formatINR(row.original.totalPaise) },
          { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} label={row.original.status === "APPROVED" ? "Open" : row.original.status === "PARTIAL" ? "Partly received" : undefined} /> },
        ]}
      />
    </>
  );
}
