"use client";

import { useState } from "react";
import { labelOf } from "@gc/shared";
import { PageHeader } from "@/components/common/page-header";
import { DocTable, NewButton, dateCol, numberCol, partyCol, statusCol, totalCol, type DocRow } from "@/components/sales/doc-list";
import type { DataColumn } from "@/components/common/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { cn } from "@/lib/utils";

const invCol: DataColumn<DocRow> = { id: "invoice", header: "Invoice", meta: { exportValue: (r) => r.invoice?.number }, cell: ({ row }) => row.original.invoice?.number ?? "—" };
const syncCol: DataColumn<DocRow> = { accessorKey: "syncStatus", header: "Tally", meta: { exportValue: (r) => labelOf(r.syncStatus) }, cell: ({ row }) => <StatusBadge status={row.original.syncStatus} /> };

export default function ReturnsPage() {
  const [tab, setTab] = useState<"returns" | "credit">("returns");
  return (
    <>
      <PageHeader title="Returns & credit notes" description="Returned stock goes back as saleable or damaged; each return raises a credit note with the invoice's GST split." />
      <div className="mb-3 inline-flex gap-1 rounded-lg bg-fill p-1">
        {(["returns", "credit"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn("rounded-md px-3 py-1.5 text-[13px] font-medium", tab === t ? "bg-[var(--segment-on)] shadow-sm" : "text-muted-foreground")}>
            {t === "returns" ? "Sales returns" : "Credit notes"}
          </button>
        ))}
      </div>
      {tab === "returns" ? (
        <DocTable
          endpoint="/sales-returns"
          href="/sales/returns"
          exportName="sales-returns"
          columns={[numberCol(), dateCol, partyCol, invCol, totalCol, statusCol()]}
          newButton={<NewButton href="/sales/returns/new" label="New return" perm="return.write" />}
        />
      ) : (
        <DocTable endpoint="/credit-notes" href="/sales/returns/credit" exportName="credit-notes" columns={[numberCol(), dateCol, partyCol, totalCol, statusCol(), syncCol]} />
      )}
    </>
  );
}
