"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { COUNT_STATUSES, formatDate, labelOf } from "@gc/shared";
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
  blind: boolean;
  godown: { name: string };
  _count: { lines: number };
}

export default function CountsPage() {
  return (
    <>
      <PageHeader
        title="Stock counts"
        description="Count a godown or rack physically; differences post to stock only after approval."
        actions={
          <Can perm="stock.count">
            <Button asChild size="sm">
              <Link href="/inventory/counts/new">
                <Plus className="size-4" /> New count
              </Link>
            </Button>
          </Can>
        }
      />
      <DataTable<Row>
        endpoint="/stock/counts"
        exportName="stock-counts"
        rowHref={(r) => `/inventory/counts/${r.id}`}
        filters={[{ key: "status", label: "Status", options: COUNT_STATUSES.map((s) => ({ value: s, label: labelOf(s) })) }]}
        columns={[
          { accessorKey: "number", header: "Number", cell: ({ row }) => <span className="font-medium">{row.original.number}</span> },
          { accessorKey: "date", header: "Date", meta: { sortKey: "date", exportValue: (r) => formatDate(r.date) }, cell: ({ row }) => formatDate(row.original.date) },
          { id: "godown", header: "Godown", meta: { exportValue: (r) => r.godown.name }, cell: ({ row }) => row.original.godown.name },
          { id: "lines", header: "Lines", meta: { align: "right", exportValue: (r) => r._count.lines }, cell: ({ row }) => row.original._count.lines },
          { id: "blind", header: "Blind", cell: ({ row }) => (row.original.blind ? "Yes" : "No") },
          { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
        ]}
      />
    </>
  );
}
