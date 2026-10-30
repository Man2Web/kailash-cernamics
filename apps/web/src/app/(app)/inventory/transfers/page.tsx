"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { formatDate } from "@gc/shared";
import { PageHeader } from "@/components/common/page-header";
import { DataTable } from "@/components/common/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Can } from "@/lib/session";
import { toast } from "sonner";
import { api, useApiMutation } from "@/lib/api";

interface Row {
  id: string;
  number: string;
  date: string;
  status: string;
  notes: string | null;
  fromGodown: { name: string; branch?: { code: string } };
  toGodown: { name: string; branch?: { code: string } };
  transitState: string | null;
  vehicleNo: string | null;
  _count: { lines: number };
}

const TABS = [
  { key: "", label: "All" },
  { key: "incoming", label: "Incoming (to receive)" },
  { key: "outgoing", label: "Sent to branches" },
];

export default function TransfersPage() {
  const [direction, setDirection] = useState("");
  const cancel = useApiMutation((id: string) => api(`/stock/transfers/${id}/cancel`, { method: "POST", body: {} }), ["/stock"]);
  return (
    <>
      <PageHeader
        title="Stock transfers"
        description="Move stock between godowns and racks, or to the showroom as display stock."
        actions={
          <Can perm="stock.transfer">
            <Button asChild size="sm">
              <Link href="/inventory/transfers/new">
                <Plus className="size-4" /> New transfer
              </Link>
            </Button>
          </Can>
        }
      />
      <div className="mb-3 inline-flex flex-wrap gap-1 rounded-lg bg-fill p-1">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setDirection(t.key)} className={direction === t.key ? "rounded-md bg-[var(--segment-on)] px-3 py-1.5 text-[13px] font-medium shadow-sm" : "rounded-md px-3 py-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground"}>
            {t.label}
          </button>
        ))}
      </div>
      <DataTable<Row>
        key={direction}
        endpoint="/stock/transfers"
        params={{ direction: direction || undefined }}
        rowHref={(r) => `/inventory/transfers/${r.id}`}
        exportName="stock-transfers"
        searchPlaceholder="Search number or note…"
        filters={[{ key: "status", label: "Status", options: [{ value: "POSTED", label: "Posted" }, { value: "CANCELLED", label: "Cancelled" }] }]}
        rowActions={[
          {
            label: "Cancel transfer",
            destructive: true,
            hidden: (r) => r.status !== "POSTED",
            onSelect: (r) => {
              if (!confirm(`Cancel ${r.number}? Stock will move back.`)) return;
              cancel.mutate(r.id, { onSuccess: () => toast.success("Transfer cancelled"), onError: (e) => toast.error(e.message) });
            },
          },
        ]}
        columns={[
          { accessorKey: "number", header: "Number", meta: { className: "whitespace-nowrap" }, cell: ({ row }) => <span className="font-medium">{row.original.number}</span> },
          { accessorKey: "date", header: "Date", meta: { sortKey: "date", className: "whitespace-nowrap", exportValue: (r) => formatDate(r.date) }, cell: ({ row }) => formatDate(row.original.date) },
          { id: "from", header: "From", meta: { exportValue: (r) => r.fromGodown.name }, cell: ({ row }) => `${row.original.fromGodown.branch?.code ? row.original.fromGodown.branch.code + " · " : ""}${row.original.fromGodown.name}` },
          { id: "to", header: "To", meta: { exportValue: (r) => r.toGodown.name }, cell: ({ row }) => `${row.original.toGodown.branch?.code ? row.original.toGodown.branch.code + " · " : ""}${row.original.toGodown.name}` },
          { id: "lines", header: "Lines", meta: { align: "right", exportValue: (r) => r._count.lines }, cell: ({ row }) => row.original._count.lines },
          {
            accessorKey: "status",
            header: "Status",
            cell: ({ row }) => (
              <span className="flex gap-1">
                <StatusBadge status={row.original.status} />
                {row.original.transitState && <StatusBadge status={row.original.transitState === "IN_TRANSIT" ? "PENDING" : "COMPLETED"} label={row.original.transitState === "IN_TRANSIT" ? "In transit" : "Received"} />}
              </span>
            ),
          },
          { accessorKey: "vehicleNo", header: "Vehicle" },
          { accessorKey: "notes", header: "Notes" },
        ]}
      />
    </>
  );
}
