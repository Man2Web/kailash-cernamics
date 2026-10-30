"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { formatDate } from "@gc/shared";
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
  reason: string;
  godown: { name: string };
  _count: { lines: number };
}

export default function AdjustmentsPage() {
  return (
    <>
      <PageHeader
        title="Stock adjustments"
        description="Corrections after a physical count. Every adjustment needs manager approval before stock changes."
        actions={
          <Can perm="stock.adjust">
            <Button asChild size="sm">
              <Link href="/inventory/adjustments/new">
                <Plus className="size-4" /> New adjustment
              </Link>
            </Button>
          </Can>
        }
      />
      <DataTable<Row>
        endpoint="/stock/adjustments"
        exportName="stock-adjustments"
        rowHref={(r) => `/inventory/adjustments/${r.id}`}
        filters={[
          {
            key: "status",
            label: "Status",
            options: ["DRAFT", "PENDING_APPROVAL", "POSTED", "CANCELLED"].map((s) => ({ value: s, label: s === "PENDING_APPROVAL" ? "Pending approval" : s[0] + s.slice(1).toLowerCase() })),
          },
        ]}
        columns={[
          { accessorKey: "number", header: "Number", meta: { className: "whitespace-nowrap" }, cell: ({ row }) => <span className="font-medium">{row.original.number}</span> },
          { accessorKey: "date", header: "Date", meta: { sortKey: "date", className: "whitespace-nowrap", exportValue: (r) => formatDate(r.date) }, cell: ({ row }) => formatDate(row.original.date) },
          { id: "godown", header: "Godown", meta: { exportValue: (r) => r.godown.name }, cell: ({ row }) => row.original.godown.name },
          { accessorKey: "reason", header: "Reason" },
          { id: "lines", header: "Lines", meta: { align: "right", exportValue: (r) => r._count.lines }, cell: ({ row }) => row.original._count.lines },
          { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
        ]}
      />
    </>
  );
}
