"use client";

import Link from "next/link";
import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { formatDateTime, formatINR, labelOf } from "@gc/shared";
import { PageHeader } from "@/components/common/page-header";
import { DataTable } from "@/components/common/data-table";
import { KpiTile } from "@/components/dashboard/kpi";
import { useApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { AlarmClock, HandCoins, Hourglass, Wallet } from "lucide-react";

interface Row {
  id: string;
  partyId: string;
  name: string;
  phone: string | null;
  segment: string;
  creditLimitPaise: number;
  creditDays: number;
  totalPaise: number;
  overduePaise: number;
  buckets: Record<"0-30" | "31-60" | "61-90" | "90+", number>;
  advancePaise: number;
  tallyClosingPaise: number | null;
  tallyAsOf: string | null;
  whatsappUrl: string | null;
}

const money = (v: number) => (v ? formatINR(v) : "—");

export default function OutstandingPage() {
  const [type, setType] = useState<"CUSTOMER" | "SUPPLIER">("CUSTOMER");
  const summary = useApi<{ summary: Record<string, number> }>("/outstanding", { type, pageSize: 1 });
  const s = summary.data?.summary;
  return (
    <>
      <PageHeader title="Outstanding" description="Ageing by invoice date; overdue is beyond the party's credit days." />
      <div className="mb-3 inline-flex gap-1 rounded-lg bg-fill p-1">
        {(["CUSTOMER", "SUPPLIER"] as const).map((t) => (
          <button key={t} onClick={() => setType(t)} className={cn("rounded-md px-3 py-1.5 text-[13px] font-medium", type === t ? "bg-[var(--segment-on)] shadow-sm" : "text-muted-foreground")}>
            {t === "CUSTOMER" ? "Receivable (customers)" : "Payable (suppliers)"}
          </button>
        ))}
      </div>
      {s && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiTile label="Total" value={formatINR(s.totalPaise)} sub={`${s.parties} parties`} icon={Wallet} tone="blue" />
          <KpiTile label="Overdue" value={formatINR(s.overduePaise)} icon={AlarmClock} tone="red" />
          <KpiTile label="0–30 / 31–60 days" value={formatINR(s.b0_30 + s.b31_60)} sub={`${formatINR(s.b0_30)} · ${formatINR(s.b31_60)}`} icon={Hourglass} tone="teal" />
          <KpiTile label="61–90 / 90+ days" value={formatINR(s.b61_90 + s.b90)} sub={`${formatINR(s.b61_90)} · ${formatINR(s.b90)}`} icon={HandCoins} tone="orange" />
        </div>
      )}
      <DataTable<Row>
        key={type}
        endpoint="/outstanding"
        params={{ type }}
        exportName={`outstanding-${type.toLowerCase()}`}
        searchPlaceholder="Search party or phone…"
        rowHref={(r) => `/accounts/statement/${r.partyId}`}
        columns={[
          { accessorKey: "name", header: "Party", cell: ({ row }) => (<div><div className="font-medium">{row.original.name}</div><div className="text-[12px] text-muted-foreground">{labelOf(row.original.segment)}{row.original.creditDays ? ` · ${row.original.creditDays} days credit` : ""}</div></div>) },
          { id: "b0", header: "0–30", meta: { align: "right", exportValue: (r) => r.buckets["0-30"] / 100 }, cell: ({ row }) => money(row.original.buckets["0-30"]) },
          { id: "b31", header: "31–60", meta: { align: "right", exportValue: (r) => r.buckets["31-60"] / 100 }, cell: ({ row }) => money(row.original.buckets["31-60"]) },
          { id: "b61", header: "61–90", meta: { align: "right", exportValue: (r) => r.buckets["61-90"] / 100 }, cell: ({ row }) => money(row.original.buckets["61-90"]) },
          { id: "b90", header: "90+", meta: { align: "right", exportValue: (r) => r.buckets["90+"] / 100 }, cell: ({ row }) => <span className={row.original.buckets["90+"] ? "text-ios-red" : undefined}>{money(row.original.buckets["90+"])}</span> },
          { accessorKey: "advancePaise", header: "Advance", meta: { align: "right", exportValue: (r) => r.advancePaise / 100 }, cell: ({ row }) => money(row.original.advancePaise) },
          { accessorKey: "overduePaise", header: "Overdue", meta: { align: "right", sortKey: "overduePaise", exportValue: (r) => r.overduePaise / 100 }, cell: ({ row }) => <span className={row.original.overduePaise ? "font-medium text-ios-red" : undefined}>{money(row.original.overduePaise)}</span> },
          { accessorKey: "totalPaise", header: "Net due", meta: { align: "right", sortKey: "totalPaise", exportValue: (r) => r.totalPaise / 100 }, cell: ({ row }) => <span className="font-semibold">{formatINR(row.original.totalPaise)}</span> },
          { id: "tally", header: "Tally balance", meta: { align: "right", exportValue: (r) => (r.tallyClosingPaise ?? 0) / 100 }, cell: ({ row }) => (row.original.tallyClosingPaise === null ? "—" : <span title={`as of ${formatDateTime(row.original.tallyAsOf)}`}>{formatINR(row.original.tallyClosingPaise)}</span>) },
          {
            id: "actions",
            header: "",
            enableHiding: false,
            cell: ({ row }) => (
              <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                {row.original.whatsappUrl && (
                  <a href={row.original.whatsappUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md bg-ios-green/14 px-2 py-1 text-[12px] font-medium text-ios-green" title="Send WhatsApp reminder">
                    <MessageCircle className="size-3.5" /> Remind
                  </a>
                )}
                <Link href={`/accounts/statement/${row.original.partyId}`} className="rounded-md bg-fill px-2 py-1 text-[12px] font-medium">Statement</Link>
              </div>
            ),
          },
        ]}
      />
    </>
  );
}
