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
  syncStatus: string;
  reason: string | null;
  totalPaise: number;
  supplier: { name: string };
  _count: { lines: number };
}

export default function DebitNotesPage() {
  return (
    <>
      <PageHeader
        title="Debit notes & purchase returns"
        description="Goods returned to suppliers (stock goes out) and rate differences."
        actions={
          <Can perm="purchase.write">
            <Button asChild size="sm">
              <Link href="/purchase/debit-notes/new">
                <Plus className="size-4" /> New debit note
              </Link>
            </Button>
          </Can>
        }
      />
      <DataTable<Row>
        endpoint="/debit-notes"
        exportName="debit-notes"
        searchPlaceholder="Search number, supplier or reason…"
        columns={[
          { accessorKey: "number", header: "Number", meta: { className: "whitespace-nowrap" }, cell: ({ row }) => <span className="font-medium">{row.original.number}</span> },
          { accessorKey: "date", header: "Date", meta: { sortKey: "date", className: "whitespace-nowrap", exportValue: (r) => formatDate(r.date) }, cell: ({ row }) => formatDate(row.original.date) },
          { id: "supplier", header: "Supplier", meta: { exportValue: (r) => r.supplier.name }, cell: ({ row }) => row.original.supplier.name },
          { accessorKey: "reason", header: "Reason" },
          { accessorKey: "totalPaise", header: "Total", meta: { align: "right", exportValue: (r) => r.totalPaise / 100 }, cell: ({ row }) => formatINR(row.original.totalPaise) },
          { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
          { accessorKey: "syncStatus", header: "Tally", cell: ({ row }) => <StatusBadge status={row.original.syncStatus} label={row.original.syncStatus === "PENDING" ? "Sync pending" : undefined} /> },
        ]}
      />
    </>
  );
}
