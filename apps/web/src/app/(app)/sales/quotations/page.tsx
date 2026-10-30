"use client";

import { QUOTATION_STATUSES, formatDate } from "@gc/shared";
import { PageHeader } from "@/components/common/page-header";
import { DocTable, NewButton, dateCol, numberCol, partyCol, statusCol, statusFilter, totalCol, type DocRow } from "@/components/sales/doc-list";
import type { DataColumn } from "@/components/common/data-table";

const validCol: DataColumn<DocRow> = { accessorKey: "validUntil", header: "Valid until", meta: { exportValue: (r) => formatDate(r.validUntil) }, cell: ({ row }) => formatDate(row.original.validUntil) };

export default function QuotationsPage() {
  return (
    <>
      <PageHeader title="Quotations" description="Room-wise quotes with boxes, wastage and GST. Convert to an order in one click." />
      <DocTable
        endpoint="/quotations"
        href="/sales/quotations"
        exportName="quotations"
        columns={[numberCol(), dateCol, partyCol, validCol, totalCol, statusCol()]}
        filters={[statusFilter(QUOTATION_STATUSES)]}
        newButton={<NewButton href="/sales/quotations/new" label="New quotation" perm="quotation.write" />}
      />
    </>
  );
}
