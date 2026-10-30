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
  supplierInvoiceNo: string;
  date: string;
  dueDate: string | null;
  status: string;
  syncStatus: string;
  totalPaise: number;
  paidPaise: number;
  varianceNotes: string | null;
  supplier: { name: string };
}

export default function PurchaseInvoicesPage() {
  return (
    <>
      <PageHeader
        title="Purchase invoices"
        description="Supplier bills matched with PO and GRN. Posted bills sync to Tally."
        actions={
          <Can perm="purchase.write">
            <Button asChild size="sm">
              <Link href="/purchase/invoices/new">
                <Plus className="size-4" /> New purchase invoice
              </Link>
            </Button>
          </Can>
        }
      />
      <DataTable<Row>
        endpoint="/purchase-invoices"
        exportName="purchase-invoices"
        rowHref={(r) => `/purchase/invoices/${r.id}`}
        searchPlaceholder="Search number, supplier invoice or supplier…"
        filters={[{ key: "status", label: "Status", options: [{ value: "DRAFT", label: "Draft" }, { value: "POSTED", label: "Posted" }, { value: "CANCELLED", label: "Cancelled" }] }]}
        columns={[
          { accessorKey: "number", header: "Number", meta: { className: "whitespace-nowrap" }, cell: ({ row }) => <span className="font-medium">{row.original.number}</span> },
          { accessorKey: "supplierInvoiceNo", header: "Supplier inv." },
          { accessorKey: "date", header: "Date", meta: { sortKey: "date", className: "whitespace-nowrap", exportValue: (r) => formatDate(r.date) }, cell: ({ row }) => formatDate(row.original.date) },
          { id: "supplier", header: "Supplier", meta: { exportValue: (r) => r.supplier.name }, cell: ({ row }) => row.original.supplier.name },
          { accessorKey: "totalPaise", header: "Total", meta: { align: "right", sortKey: "totalPaise", exportValue: (r) => r.totalPaise / 100 }, cell: ({ row }) => formatINR(row.original.totalPaise) },
          { id: "due", header: "Due", meta: { align: "right", exportValue: (r) => (r.totalPaise - r.paidPaise) / 100 }, cell: ({ row }) => formatINR(row.original.totalPaise - row.original.paidPaise) },
          { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
          { accessorKey: "syncStatus", header: "Tally", cell: ({ row }) => <StatusBadge status={row.original.syncStatus === "PENDING" ? "PENDING" : row.original.syncStatus} label={row.original.syncStatus === "PENDING" ? "Sync pending" : undefined} /> },
          { id: "variance", header: "Variance", meta: { exportValue: (r) => r.varianceNotes }, cell: ({ row }) => (row.original.varianceNotes ? <StatusBadge status="PENDING" label="Check" /> : null) },
        ]}
      />
    </>
  );
}
