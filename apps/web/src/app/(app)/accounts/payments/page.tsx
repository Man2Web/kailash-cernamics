"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { formatDate, formatINR, labelOf, PAYMENT_MODES } from "@gc/shared";
import { PageHeader } from "@/components/common/page-header";
import { DataTable } from "@/components/common/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/session";

interface PaymentRow {
  id: string;
  number: string;
  date: string;
  mode: string;
  amountPaise: number;
  reference: string | null;
  status: string;
  syncStatus: string;
  party: { id: string; name: string };
}

export default function PaymentsPage() {
  const { can } = useSession();
  return (
    <>
      <PageHeader
        title="Supplier payments"
        description="Payments to suppliers and brands, allocated to purchase bills."
        actions={
          can("payment.write") && (
            <Button asChild size="sm">
              <Link href="/accounts/payments/new">
                <Plus className="size-4" /> New payment
              </Link>
            </Button>
          )
        }
      />
      <DataTable<PaymentRow>
        endpoint="/payments"
        exportName="supplier-payments"
        rowHref={(r) => `/accounts/payments/${r.id}`}
        filters={[
          { key: "mode", label: "Mode", options: PAYMENT_MODES.map((m) => ({ value: m, label: labelOf(m) })) },
          { key: "status", label: "Status", options: [{ value: "POSTED", label: "Posted" }, { value: "CANCELLED", label: "Cancelled" }] },
        ]}
        columns={[
          { accessorKey: "number", header: "Number", meta: { sortKey: "number" }, cell: ({ row }) => <span className="font-medium">{row.original.number}</span> },
          { accessorKey: "date", header: "Date", meta: { sortKey: "date", exportValue: (r) => formatDate(r.date) }, cell: ({ row }) => formatDate(row.original.date) },
          { id: "party", header: "Supplier", meta: { exportValue: (r) => r.party.name }, cell: ({ row }) => row.original.party.name },
          { accessorKey: "mode", header: "Mode", cell: ({ row }) => labelOf(row.original.mode) },
          { accessorKey: "reference", header: "Reference" },
          { accessorKey: "amountPaise", header: "Amount", meta: { align: "right", sortKey: "amountPaise", exportValue: (r) => r.amountPaise / 100 }, cell: ({ row }) => formatINR(row.original.amountPaise) },
          { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
          { accessorKey: "syncStatus", header: "Tally", cell: ({ row }) => <StatusBadge status={row.original.syncStatus} /> },
        ]}
      />
    </>
  );
}
