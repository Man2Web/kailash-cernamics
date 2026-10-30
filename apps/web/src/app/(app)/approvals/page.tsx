"use client";

import { toast } from "sonner";
import { APPROVAL_STATUSES, APPROVAL_TYPES, formatDateTime, labelOf } from "@gc/shared";
import { PageHeader } from "@/components/common/page-header";
import { DataTable } from "@/components/common/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { api, useApiMutation } from "@/lib/api";

interface Approval {
  id: string;
  type: string;
  refType: string;
  refId: string;
  status: string;
  reason: string;
  createdAt: string;
  decisionNote: string | null;
  requestedBy: { name: string };
  decidedBy: { name: string } | null;
}

const REF_LINKS: Record<string, string> = {
  sales_order: "/sales/orders",
  quotation: "/sales/quotations",
  invoice: "/sales/invoices",
  stock_adjustment: "/inventory/adjustments",
  breakage_entry: "/inventory/breakage",
};

export default function ApprovalsPage() {
  const decide = useApiMutation((v: { id: string; approve: boolean; note?: string }) => api(`/approvals/${v.id}/decide`, { method: "POST", body: { approve: v.approve, note: v.note } }), ["/approvals", "/sales", "/inventory"]);
  const act = (id: string, approve: boolean) => {
    const note = approve ? undefined : prompt("Reason for rejecting?") ?? undefined;
    decide.mutate({ id, approve, note }, { onSuccess: () => toast.success(approve ? "Approved" : "Rejected"), onError: (e) => toast.error(e.message) });
  };
  return (
    <>
      <PageHeader title="Approvals" description="Discounts above role limit, credit holds, stock adjustments and write-offs." />
      <DataTable<Approval>
        endpoint="/approvals"
        params={{}}
        filters={[
          { key: "status", label: "Status", options: APPROVAL_STATUSES.map((s) => ({ value: s, label: labelOf(s) })) },
          { key: "type", label: "Type", options: APPROVAL_TYPES.map((s) => ({ value: s, label: labelOf(s) })) },
        ]}
        exportName="approvals"
        columns={[
          { accessorKey: "createdAt", header: "Requested", cell: ({ row }) => formatDateTime(row.original.createdAt), meta: { sortKey: "createdAt", exportValue: (r) => formatDateTime(r.createdAt) } },
          { accessorKey: "type", header: "Type", cell: ({ row }) => labelOf(row.original.type) },
          {
            accessorKey: "reason",
            header: "Reason",
            cell: ({ row }) => {
              const base = REF_LINKS[row.original.refType];
              return base ? <a className="text-tint hover:underline" href={`${base}/${row.original.refId}`}>{row.original.reason}</a> : row.original.reason;
            },
          },
          { id: "by", header: "Requested by", cell: ({ row }) => row.original.requestedBy?.name, meta: { exportValue: (r) => r.requestedBy?.name } },
          { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
          {
            id: "actions",
            header: "",
            cell: ({ row }) =>
              row.original.status === "PENDING" ? (
                <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" className="h-7" onClick={() => act(row.original.id, true)}>
                    Approve
                  </Button>
                  <Button size="sm" variant="secondary" className="h-7" onClick={() => act(row.original.id, false)}>
                    Reject
                  </Button>
                </div>
              ) : (
                <span className="text-[12px] text-muted-foreground">{row.original.decidedBy?.name}</span>
              ),
          },
        ]}
      />
    </>
  );
}
