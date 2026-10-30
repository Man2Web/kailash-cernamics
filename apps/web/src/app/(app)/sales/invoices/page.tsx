"use client";

import { formatINR, labelOf } from "@gc/shared";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { DocTable, NewButton, dateCol, numberCol, partyCol, statusCol, statusFilter, totalCol, type DocRow } from "@/components/sales/doc-list";
import type { DataColumn } from "@/components/common/data-table";

const dueCol: DataColumn<DocRow> = {
  id: "due",
  header: "Balance",
  meta: { align: "right", exportValue: (r) => (Number(r.totalPaise ?? 0) - Number(r.paidPaise ?? 0)) / 100 },
  cell: ({ row }) => (row.original.status === "POSTED" ? formatINR(Number(row.original.totalPaise) - Number(row.original.paidPaise ?? 0)) : "—"),
};
const syncCol: DataColumn<DocRow> = {
  accessorKey: "syncStatus",
  header: "Tally",
  meta: { exportValue: (r) => labelOf(r.syncStatus) },
  cell: ({ row }) => (row.original.status === "DRAFT" ? null : <StatusBadge status={row.original.syncStatus} />),
};

export default function InvoicesPage() {
  return (
    <>
      <PageHeader title="Invoices" description="Posted invoices are never edited — cancel and re-issue. Each posted invoice is queued for Tally." />
      <DocTable
        endpoint="/invoices"
        href="/sales/invoices"
        exportName="invoices"
        columns={[numberCol("Draft"), dateCol, partyCol, totalCol, dueCol, statusCol(), syncCol]}
        filters={[
          statusFilter(["DRAFT", "POSTED", "CANCELLED"]),
          { key: "syncStatus", label: "Tally", options: ["NOT_QUEUED", "PENDING", "SYNCED", "FAILED"].map((v) => ({ value: v, label: labelOf(v) })) },
        ]}
        newButton={<NewButton href="/sales/invoices/new" label="New invoice" perm="invoice.write" />}
      />
    </>
  );
}
