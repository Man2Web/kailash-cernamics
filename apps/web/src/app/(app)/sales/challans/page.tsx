"use client";

import { PageHeader } from "@/components/common/page-header";
import { DocTable, NewButton, dateCol, numberCol, partyCol, statusCol, statusFilter, type DocRow } from "@/components/sales/doc-list";
import type { DataColumn } from "@/components/common/data-table";

const LABELS = { POSTED: "Ready", COMPLETED: "Delivered" };
const invCol: DataColumn<DocRow> = { id: "invoice", header: "Invoice", meta: { exportValue: (r) => r.invoice?.number }, cell: ({ row }) => row.original.invoice?.number ?? "—" };
const vehicleCol: DataColumn<DocRow> = {
  id: "vehicle",
  header: "Vehicle",
  meta: { exportValue: (r) => r.dispatches?.[0]?.vehicle?.number },
  cell: ({ row }) => row.original.dispatches?.[0]?.vehicle?.number ?? (row.original.dispatches?.length ? "Dispatched" : "—"),
};

export default function ChallansPage() {
  return (
    <>
      <PageHeader title="Challans & dispatch" description="Delivery challans for posted invoices, vehicle dispatch, loading charges and proof of delivery." />
      <DocTable
        endpoint="/challans"
        href="/sales/challans"
        exportName="challans"
        columns={[numberCol(), dateCol, partyCol, invCol, vehicleCol, statusCol(LABELS)]}
        filters={[statusFilter(["POSTED", "COMPLETED", "CANCELLED"], LABELS)]}
        newButton={<NewButton href="/sales/challans/new" label="New challan" perm="dispatch.write" />}
      />
    </>
  );
}
