"use client";

import Link from "next/link";
import { Plus, Upload } from "lucide-react";
import { formatINR, labelOf, SEGMENTS } from "@gc/shared";
import { PageHeader } from "@/components/common/page-header";
import { DataTable } from "@/components/common/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Can } from "@/lib/session";

export interface PartyRow {
  id: string;
  type: string;
  segment: string;
  name: string;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  stateCode: string;
  city: string | null;
  creditLimitPaise: number;
  creditDays: number;
  openingBalancePaise: number;
  isActive: boolean;
}

/** Customers or suppliers list (type=CUSTOMER also shows BOTH). */
export function PartyList({ kind }: { kind: "CUSTOMER" | "SUPPLIER" }) {
  const title = kind === "CUSTOMER" ? "Customers" : "Suppliers";
  return (
    <>
      <PageHeader
        title={title}
        description={kind === "CUSTOMER" ? "Retail, contractor, builder, dealer and institution customers." : "Brand companies and distributors you buy from."}
        actions={
          <Can perm="party.write">
            <Button asChild variant="secondary">
              <Link href="/settings/import?kind=parties">
                <Upload className="size-4" /> Import
              </Link>
            </Button>
            <Button asChild>
              <Link href={`/parties/new?type=${kind}`}>
                <Plus className="size-4" /> New {kind === "CUSTOMER" ? "customer" : "supplier"}
              </Link>
            </Button>
          </Can>
        }
      />
      <DataTable<PartyRow>
        endpoint="/parties"
        params={{ type: kind }}
        storageKey={`parties-${kind}`}
        exportName={title.toLowerCase()}
        searchPlaceholder="Search name, phone, GSTIN, city…"
        rowHref={(p) => `/parties/${p.id}`}
        filters={[
          ...(kind === "CUSTOMER" ? [{ key: "segment", label: "Segment", options: SEGMENTS.filter((s) => s !== "CLEARANCE").map((s) => ({ value: s, label: labelOf(s) })) }] : []),
          { key: "isActive", label: "Status", options: [{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }] },
        ]}
        columns={[
          { accessorKey: "name", header: "Name", meta: { sortKey: "name" }, cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
          ...(kind === "CUSTOMER" ? [{ accessorKey: "segment", header: "Segment", cell: ({ row }: { row: { original: PartyRow } }) => labelOf(row.original.segment) }] : []),
          { accessorKey: "phone", header: "Phone" },
          { accessorKey: "city", header: "City", meta: { sortKey: "city" } },
          { accessorKey: "gstin", header: "GSTIN", meta: { className: "font-mono text-[12px]" } },
          { accessorKey: "creditLimitPaise", header: "Credit limit", meta: { align: "right", exportValue: (r) => r.creditLimitPaise / 100 }, cell: ({ row }) => (row.original.creditLimitPaise ? formatINR(row.original.creditLimitPaise) : "—") },
          { accessorKey: "creditDays", header: "Credit days", meta: { align: "right" } },
          {
            accessorKey: "isActive",
            header: "Status",
            cell: ({ row }) => <StatusBadge status={row.original.isActive ? "POSTED" : "CANCELLED"} label={row.original.isActive ? "Active" : "Inactive"} />,
            meta: { exportValue: (r) => (r.isActive ? "Active" : "Inactive") },
          },
        ]}
      />
    </>
  );
}
