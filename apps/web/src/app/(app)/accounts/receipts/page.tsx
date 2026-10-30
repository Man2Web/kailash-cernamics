"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { CHEQUE_STATUSES, formatDate, formatINR, labelOf, PAYMENT_MODES } from "@gc/shared";
import { PageHeader } from "@/components/common/page-header";
import { DataTable } from "@/components/common/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/session";
import type { ReceiptRow } from "@/components/accounts/types";


export default function ReceiptsPage() {
  const { can } = useSession();
  return (
    <>
      <PageHeader
        title="Receipts"
        description="Money received from customers, allocated to invoices oldest first."
        actions={
          can("receipt.write") && (
            <Button asChild size="sm">
              <Link href="/accounts/receipts/new">
                <Plus className="size-4" /> New receipt
              </Link>
            </Button>
          )
        }
      />
      <DataTable<ReceiptRow>
        endpoint="/receipts"
        exportName="receipts"
        searchPlaceholder="Search number, customer, reference, cheque…"
        rowHref={(r) => `/accounts/receipts/${r.id}`}
        filters={[
          { key: "mode", label: "Mode", options: PAYMENT_MODES.map((m) => ({ value: m, label: labelOf(m) })) },
          { key: "status", label: "Status", options: [{ value: "POSTED", label: "Posted" }, { value: "CANCELLED", label: "Cancelled" }] },
          { key: "chequeStatus", label: "Cheque", options: CHEQUE_STATUSES.map((m) => ({ value: m, label: labelOf(m) })) },
        ]}
        columns={[
          { accessorKey: "number", header: "Number", meta: { sortKey: "number" }, cell: ({ row }) => <span className="font-medium">{row.original.number}</span> },
          { accessorKey: "date", header: "Date", meta: { sortKey: "date", exportValue: (r) => formatDate(r.date) }, cell: ({ row }) => formatDate(row.original.date) },
          { id: "party", header: "Customer", meta: { exportValue: (r) => r.party.name }, cell: ({ row }) => row.original.party.name },
          { accessorKey: "mode", header: "Mode", cell: ({ row }) => <span>{labelOf(row.original.mode)}{row.original.chequeNo ? ` · ${row.original.chequeNo}` : ""}</span> },
          { accessorKey: "amountPaise", header: "Amount", meta: { align: "right", sortKey: "amountPaise", exportValue: (r) => r.amountPaise / 100 }, cell: ({ row }) => formatINR(row.original.amountPaise) },
          { accessorKey: "unallocatedPaise", header: "Advance", meta: { align: "right", exportValue: (r) => r.unallocatedPaise / 100 }, cell: ({ row }) => (row.original.unallocatedPaise ? formatINR(row.original.unallocatedPaise) : "—") },
          {
            accessorKey: "status",
            header: "Status",
            cell: ({ row }) => (
              <div className="flex flex-wrap gap-1">
                <StatusBadge status={row.original.status} />
                {row.original.chequeStatus && <StatusBadge status={row.original.chequeStatus} label={`Cheque ${labelOf(row.original.chequeStatus).toLowerCase()}`} />}
                {row.original.source === "TALLY" && <StatusBadge status="SYNCED" label="From Tally" />}
              </div>
            ),
          },
          { accessorKey: "syncStatus", header: "Tally", cell: ({ row }) => <StatusBadge status={row.original.syncStatus === "PENDING" ? "PENDING" : row.original.syncStatus} label={row.original.syncStatus === "PENDING" ? "Sync pending" : undefined} /> },
        ]}
      />
    </>
  );
}
