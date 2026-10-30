"use client";

import { formatDate } from "@gc/shared";
import { PageHeader } from "@/components/common/page-header";
import { DocTable, NewButton, ORDER_STATUS_LABEL, dateCol, numberCol, partyCol, statusCol, statusFilter, totalCol, type DocRow } from "@/components/sales/doc-list";
import type { DataColumn } from "@/components/common/data-table";

const deliveryCol: DataColumn<DocRow> = { accessorKey: "deliveryDate", header: "Delivery", meta: { exportValue: (r) => formatDate(r.deliveryDate) }, cell: ({ row }) => formatDate(row.original.deliveryDate) || "—" };

export default function OrdersPage() {
  return (
    <>
      <PageHeader title="Sales orders" description="Confirmed orders reserve stock from one batch per line. Discounts and credit beyond limits go for approval." />
      <DocTable
        endpoint="/sales-orders"
        href="/sales/orders"
        exportName="sales-orders"
        columns={[numberCol(), dateCol, partyCol, deliveryCol, totalCol, statusCol(ORDER_STATUS_LABEL)]}
        filters={[statusFilter(["DRAFT", "PENDING_APPROVAL", "APPROVED", "PARTIAL", "COMPLETED", "CANCELLED"], ORDER_STATUS_LABEL)]}
        newButton={<NewButton href="/sales/orders/new" label="New order" perm="order.write" />}
      />
    </>
  );
}
