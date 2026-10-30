"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { formatDate, formatINR, labelOf } from "@gc/shared";
import { Button } from "@/components/ui/button";
import { DataTable, type DataColumn, type FilterDef } from "@/components/common/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { useSession } from "@/lib/session";
import type { PermissionCode } from "@gc/shared";

export interface DocRow {
  id: string;
  number: string | null;
  date: string;
  status: string;
  totalPaise?: number;
  party?: { id: string; name: string; phone?: string | null } | null;
  [k: string]: any;
}

export const ORDER_STATUS_LABEL: Record<string, string> = { APPROVED: "Confirmed", PARTIAL: "Part invoiced", COMPLETED: "Invoiced" };

export function statusFilter(values: readonly string[], labels: Record<string, string> = {}): FilterDef {
  return { key: "status", label: "Status", options: values.map((v) => ({ value: v, label: labels[v] ?? labelOf(v) })) };
}

export const numberCol = (fallback = "Draft"): DataColumn<DocRow> => ({
  accessorKey: "number",
  header: "Number",
  meta: { sortKey: "number", exportValue: (r) => r.number ?? fallback },
  cell: ({ row }) => <span className="font-medium tabular">{row.original.number ?? <span className="text-muted-foreground">{fallback}</span>}{row.original.revisionNo > 1 ? <span className="ml-1 text-[11px] text-muted-foreground">Rev {row.original.revisionNo}</span> : null}</span>,
});
export const dateCol: DataColumn<DocRow> = { accessorKey: "date", header: "Date", meta: { sortKey: "date", exportValue: (r) => formatDate(r.date) }, cell: ({ row }) => formatDate(row.original.date) };
export const partyCol: DataColumn<DocRow> = {
  id: "party",
  header: "Customer",
  meta: { sortKey: "party.name", exportValue: (r) => r.party?.name ?? r.customerName },
  cell: ({ row }) => <span className="truncate">{row.original.party?.name ?? row.original.customerName ?? "—"}</span>,
};
export const totalCol: DataColumn<DocRow> = {
  accessorKey: "totalPaise",
  header: "Total",
  meta: { align: "right", sortKey: "totalPaise", exportValue: (r) => Number(r.totalPaise ?? 0) / 100 },
  cell: ({ row }) => formatINR(row.original.totalPaise ?? 0),
};
export const statusCol = (labels: Record<string, string> = {}): DataColumn<DocRow> => ({
  accessorKey: "status",
  header: "Status",
  meta: { exportValue: (r) => labels[r.status] ?? labelOf(r.status) },
  cell: ({ row }) => <StatusBadge status={row.original.status} label={labels[row.original.status]} />,
});

export function NewButton({ href, label, perm }: { href: string; label: string; perm: PermissionCode }) {
  const { can } = useSession();
  if (!can(perm)) return null;
  return (
    <Button asChild size="sm" className="h-9">
      <Link href={href}>
        <Plus className="size-4" /> {label}
      </Link>
    </Button>
  );
}

export function DocTable({ endpoint, columns, filters, href, newButton, exportName, params }: { endpoint: string; columns: DataColumn<DocRow>[]; filters?: FilterDef[]; href: string; newButton?: React.ReactNode; exportName: string; params?: Record<string, string> }) {
  return (
    <DataTable<DocRow>
      endpoint={endpoint}
      columns={columns}
      filters={filters}
      params={params}
      exportName={exportName}
      searchPlaceholder="Search number or customer…"
      rowHref={(r) => `${href}/${r.id}`}
      toolbar={newButton}
      defaultSort={{ sort: "date", dir: "desc" }}
    />
  );
}
