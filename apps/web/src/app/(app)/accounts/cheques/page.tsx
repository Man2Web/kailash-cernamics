"use client";

import { toast } from "sonner";
import { CHEQUE_STATUSES, formatDate, formatINR, labelOf } from "@gc/shared";
import { PageHeader } from "@/components/common/page-header";
import { DataTable } from "@/components/common/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { api, useApiMutation } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { ReceiptRow } from "@/components/accounts/types";

type ChequeRow = ReceiptRow & { chequeDate: string | null; bankName: string | null };

export default function ChequesPage() {
  const { can } = useSession();
  const set = useApiMutation((v: { id: string; status: string; note?: string }) => api(`/receipts/${v.id}/cheque-status`, { method: "POST", body: { status: v.status, note: v.note } }), ["/cheques", "/receipts", "/outstanding"]);
  const change = (id: string, status: string) => {
    const note = status === "BOUNCED" ? prompt("Bounce reason?") : undefined;
    if (status === "BOUNCED" && note === null) return;
    set.mutate({ id, status, note: note ?? undefined }, { onSuccess: () => toast.success(status === "BOUNCED" ? "Marked bounced; invoice payments reversed" : `Marked ${labelOf(status).toLowerCase()}`), onError: (e) => toast.error(e.message) });
  };
  return (
    <>
      <PageHeader title="Cheque register" description="Customer cheques: deposit, clear or mark bounced (bounce reverses the invoice allocations)." />
      <DataTable<ChequeRow>
        endpoint="/cheques"
        exportName="cheque-register"
        rowHref={(r) => `/accounts/receipts/${r.id}`}
        filters={[{ key: "chequeStatus", label: "Status", options: CHEQUE_STATUSES.map((s) => ({ value: s, label: labelOf(s) })) }]}
        rowActions={
          can("receipt.write")
            ? [
                { label: "Mark deposited", onSelect: (r) => change(r.id, "DEPOSITED"), hidden: (r) => r.chequeStatus !== "PENDING" },
                { label: "Mark cleared", onSelect: (r) => change(r.id, "CLEARED"), hidden: (r) => r.chequeStatus === "CLEARED" || r.chequeStatus === "BOUNCED" },
                { label: "Mark bounced", destructive: true, onSelect: (r) => change(r.id, "BOUNCED"), hidden: (r) => r.chequeStatus === "BOUNCED" || r.chequeStatus === "CLEARED" },
              ]
            : undefined
        }
        columns={[
          { accessorKey: "chequeNo", header: "Cheque no.", cell: ({ row }) => <span className="font-medium">{row.original.chequeNo}</span> },
          { accessorKey: "chequeDate", header: "Cheque date", meta: { exportValue: (r) => formatDate(r.chequeDate) }, cell: ({ row }) => formatDate(row.original.chequeDate) || "—" },
          { accessorKey: "bankName", header: "Bank" },
          { id: "party", header: "Customer", meta: { exportValue: (r) => r.party.name }, cell: ({ row }) => row.original.party.name },
          { accessorKey: "number", header: "Receipt" },
          { accessorKey: "amountPaise", header: "Amount", meta: { align: "right", exportValue: (r) => r.amountPaise / 100 }, cell: ({ row }) => formatINR(row.original.amountPaise) },
          { accessorKey: "chequeStatus", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.chequeStatus} /> },
        ]}
      />
    </>
  );
}
