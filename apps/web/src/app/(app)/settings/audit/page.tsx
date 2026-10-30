"use client";

import { useState } from "react";
import { formatDateTime, labelOf } from "@gc/shared";
import { PageHeader } from "@/components/common/page-header";
import { DataTable } from "@/components/common/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useApi } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Audit {
  id: string;
  userId: string | null;
  entity: string;
  entityId: string;
  action: string;
  before: unknown;
  after: unknown;
  ip: string | null;
  createdAt: string;
}
interface Login {
  id: string;
  email: string;
  success: boolean;
  reason: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

const ENTITIES = ["product", "party", "brand", "price_list_item", "user", "role", "branch", "invoice", "quotation", "sales_order", "grn", "receipt", "stock_adjustment", "setting"];

function AuditLog() {
  const users = useApi<{ items: { id: string; name: string }[] }>("/users", { pageSize: 200 });
  const name = (id: string | null) => users.data?.items.find((u) => u.id === id)?.name ?? (id ? "—" : "System");
  const [open, setOpen] = useState<Audit | null>(null);
  return (
    <>
      <DataTable<Audit>
        endpoint="/audit-log"
        exportName="audit-log"
        searchPlaceholder="Search is by filters below"
        filters={[{ key: "entity", label: "Record", options: ENTITIES.map((e) => ({ value: e, label: labelOf(e) })) }]}
        onRowClick={(r) => setOpen(r)}
        columns={[
          { accessorKey: "createdAt", header: "When", cell: ({ row }) => formatDateTime(row.original.createdAt), meta: { exportValue: (r) => formatDateTime(r.createdAt) } },
          { id: "user", header: "User", cell: ({ row }) => name(row.original.userId), meta: { exportValue: (r) => name(r.userId) } },
          { accessorKey: "entity", header: "Record", cell: ({ row }) => labelOf(row.original.entity) },
          { accessorKey: "action", header: "Action", cell: ({ row }) => labelOf(row.original.action) },
          { accessorKey: "entityId", header: "Id", meta: { className: "font-mono text-[11px] text-muted-foreground" } },
          { accessorKey: "ip", header: "IP" },
        ]}
      />
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {open && `${labelOf(open.entity)} · ${labelOf(open.action)} · ${formatDateTime(open.createdAt)}`}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            {(["before", "after"] as const).map((k) => (
              <div key={k}>
                <div className="mb-1 text-[12px] font-semibold text-muted-foreground uppercase">{k}</div>
                <pre className="max-h-[60vh] overflow-auto rounded-md bg-fill p-2 text-[11px]">{open?.[k] ? JSON.stringify(open[k], null, 2) : "—"}</pre>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Logins() {
  return (
    <DataTable<Login>
      endpoint="/auth/login-history"
      exportName="login-history"
      columns={[
        { accessorKey: "createdAt", header: "When", cell: ({ row }) => formatDateTime(row.original.createdAt), meta: { exportValue: (r) => formatDateTime(r.createdAt) } },
        { accessorKey: "email", header: "Email" },
        { accessorKey: "success", header: "Result", cell: ({ row }) => <StatusBadge status={row.original.success ? "POSTED" : "FAILED"} label={row.original.success ? "Signed in" : "Failed"} /> },
        { accessorKey: "reason", header: "Reason" },
        { accessorKey: "ip", header: "IP" },
        { accessorKey: "userAgent", header: "Device", cell: ({ row }) => <span className="line-clamp-1 max-w-72 text-[12px] text-muted-foreground">{row.original.userAgent}</span> },
      ]}
    />
  );
}

export default function AuditPage() {
  const [tab, setTab] = useState<"audit" | "logins">("audit");
  return (
    <>
      <PageHeader title="Audit & logins" description="Who changed what (before and after), and every sign-in attempt." />
      <div className="mb-3 inline-flex gap-1 rounded-lg bg-fill p-1">
        {(["audit", "logins"] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)} className={cn("rounded-md px-3 py-1.5 text-[13px] font-medium", tab === k ? "bg-[var(--segment-on)] shadow-sm" : "text-muted-foreground")}>
            {k === "audit" ? "Audit log" : "Login history"}
          </button>
        ))}
      </div>
      {tab === "audit" ? <AuditLog /> : <Logins />}
    </>
  );
}
