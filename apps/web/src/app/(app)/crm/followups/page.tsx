"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { formatDateTime } from "@gc/shared";
import { PageHeader } from "@/components/common/page-header";
import { DataTable } from "@/components/common/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { FollowupDoneDialog } from "@/components/crm/followup-done";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

interface Row {
  id: string;
  dueAt: string;
  doneAt: string | null;
  notes: string | null;
  outcome: string | null;
  lead: { id: string; name: string; phone: string | null; status: string; requirement: string | null };
}

const TABS = [
  { key: "today", label: "Today" },
  { key: "overdue", label: "Overdue" },
  { key: "upcoming", label: "Upcoming" },
  { key: "done", label: "Done" },
] as const;

export default function FollowupsPage() {
  const { can } = useSession();
  const qc = useQueryClient();
  const [when, setWhen] = useState<(typeof TABS)[number]["key"]>("today");
  const [done, setDone] = useState<Row | null>(null);
  return (
    <>
      <PageHeader title="Follow-ups" description="Calls and visits due for each lead." />
      <div className="mb-3 inline-flex gap-1 rounded-lg bg-fill p-1">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setWhen(t.key)} className={cn("rounded-md px-3 py-1.5 text-[13px] font-medium", when === t.key ? "bg-[var(--segment-on)] shadow-sm" : "text-muted-foreground")}>
            {t.label}
          </button>
        ))}
      </div>
      <DataTable<Row>
        key={when}
        endpoint="/followups"
        params={{ when }}
        exportName={`followups-${when}`}
        searchPlaceholder="Search lead name or phone…"
        filters={[{ key: "mine", label: "Owner", options: [{ value: "true", label: "Mine" }] }]}
        columns={[
          { accessorKey: "dueAt", header: "Due", meta: { exportValue: (r) => formatDateTime(r.dueAt) }, cell: ({ row }) => <span className={!row.original.doneAt && new Date(row.original.dueAt) < new Date() ? "text-ios-red" : undefined}>{formatDateTime(row.original.dueAt)}</span> },
          { id: "lead", header: "Lead", meta: { exportValue: (r) => r.lead.name }, cell: ({ row }) => <Link href={`/crm/leads/${row.original.lead.id}`} className="font-medium hover:underline">{row.original.lead.name}</Link> },
          { id: "phone", header: "Phone", meta: { exportValue: (r) => r.lead.phone }, cell: ({ row }) => row.original.lead.phone ? <a href={`tel:${row.original.lead.phone}`} className="text-tint">{row.original.lead.phone}</a> : "—" },
          { accessorKey: "notes", header: "Notes", cell: ({ row }) => <span className="line-clamp-2 max-w-72">{row.original.outcome ? `→ ${row.original.outcome}` : row.original.notes ?? row.original.lead.requirement}</span> },
          { id: "stage", header: "Stage", cell: ({ row }) => <StatusBadge status={row.original.lead.status} /> },
          { id: "act", header: "", enableHiding: false, cell: ({ row }) => !row.original.doneAt && can("crm.write") ? <Button size="sm" className="h-7" onClick={(e) => { e.stopPropagation(); setDone(row.original); }}>Done</Button> : null },
        ]}
      />
      {done && (
        <FollowupDoneDialog
          followupId={done.id}
          leadName={done.lead.name}
          onClose={() => setDone(null)}
          onDone={() => {
            setDone(null);
            qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === "/followups" || q.queryKey[0] === "/dashboard" });
          }}
        />
      )}
    </>
  );
}
