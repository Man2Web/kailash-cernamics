"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { CRM_LEAD_SOURCES, formatDate, formatDateTime, labelOf, LEAD_STATUSES } from "@gc/shared";
import { PageHeader } from "@/components/common/page-header";
import { DataTable } from "@/components/common/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/session";

interface LeadRow {
  id: string;
  name: string;
  phone: string | null;
  source: string;
  status: string;
  requirement: string | null;
  nextFollowupAt: string | null;
  createdAt: string;
  assignedTo: { id: string; name: string } | null;
}

export default function LeadsPage() {
  const { can } = useSession();
  return (
    <>
      <PageHeader
        title="Leads"
        description="Enquiries from walk-ins, calls, architects and contractors."
        actions={can("crm.write") && (
          <Button asChild size="sm">
            <Link href="/crm/leads/new"><Plus className="size-4" /> New lead</Link>
          </Button>
        )}
      />
      <DataTable<LeadRow>
        endpoint="/leads"
        exportName="leads"
        searchPlaceholder="Search name, phone, requirement…"
        rowHref={(r) => `/crm/leads/${r.id}`}
        filters={[
          { key: "status", label: "Stage", options: LEAD_STATUSES.map((s) => ({ value: s, label: labelOf(s) })) },
          { key: "source", label: "Source", options: CRM_LEAD_SOURCES.map((s) => ({ value: s, label: labelOf(s) })) },
          { key: "mine", label: "Owner", options: [{ value: "true", label: "Assigned to me" }] },
        ]}
        columns={[
          { accessorKey: "name", header: "Name", meta: { sortKey: "name" }, cell: ({ row }) => (<div><div className="font-medium">{row.original.name}</div><div className="text-[12px] text-muted-foreground">{row.original.phone}</div></div>) },
          { accessorKey: "requirement", header: "Requirement", cell: ({ row }) => <span className="line-clamp-2 max-w-80 text-[13px]">{row.original.requirement}</span> },
          { accessorKey: "source", header: "Source", cell: ({ row }) => labelOf(row.original.source) },
          { accessorKey: "status", header: "Stage", meta: { sortKey: "status" }, cell: ({ row }) => <StatusBadge status={row.original.status} /> },
          { accessorKey: "nextFollowupAt", header: "Next follow-up", meta: { sortKey: "nextFollowupAt", exportValue: (r) => formatDateTime(r.nextFollowupAt) }, cell: ({ row }) => {
            const v = row.original.nextFollowupAt;
            if (!v) return "—";
            return <span className={new Date(v) < new Date() ? "text-ios-red" : undefined}>{formatDateTime(v)}</span>;
          } },
          { id: "owner", header: "Assigned to", meta: { exportValue: (r) => r.assignedTo?.name }, cell: ({ row }) => row.original.assignedTo?.name ?? "—" },
          { accessorKey: "createdAt", header: "Created", meta: { sortKey: "createdAt", exportValue: (r) => formatDate(r.createdAt) }, cell: ({ row }) => formatDate(row.original.createdAt) },
        ]}
      />
    </>
  );
}
