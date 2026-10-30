"use client";

import { INFLUENCER_TYPES, labelOf, partiesInfluencerSchema } from "@gc/shared";
import { PageHeader } from "@/components/common/page-header";
import { MasterPage, type MasterConfig } from "@/components/common/master-page";
import { StatusBadge } from "@/components/common/status-badge";
import { InfluencerPayouts } from "@/components/crm/influencer-payouts";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface Influencer {
  id: string;
  type: string;
  name: string;
  phone: string | null;
  firm: string | null;
  commissionPct: number;
  pointsBalance: number;
  isActive: boolean;
}

const config: MasterConfig<Influencer> = {
  title: "Influencers",
  singular: "Influencer",
  endpoint: "/influencers",
  writePerm: "party.write",
  schema: partiesInfluencerSchema,
  defaults: { type: "ARCHITECT", name: "", phone: "", firm: "", commissionPct: 1, isActive: true },
  filters: [
    { key: "type", label: "Type", options: INFLUENCER_TYPES.map((t) => ({ value: t, label: labelOf(t) })) },
    { key: "isActive", label: "Status", options: [{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }] },
  ],
  columns: [
    { accessorKey: "name", header: "Name", meta: { sortKey: "name" }, cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { accessorKey: "type", header: "Type", cell: ({ row }) => labelOf(row.original.type) },
    { accessorKey: "firm", header: "Firm" },
    { accessorKey: "phone", header: "Phone" },
    { accessorKey: "commissionPct", header: "Commission %", meta: { align: "right" } },
    { accessorKey: "pointsBalance", header: "Points", meta: { align: "right", sortKey: "pointsBalance" } },
    {
      accessorKey: "isActive",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.isActive ? "POSTED" : "CANCELLED"} label={row.original.isActive ? "Active" : "Inactive"} />,
    },
  ],
  fields: [
    { name: "name", label: "Name", type: "text", required: true },
    { name: "type", label: "Type", type: "select", options: INFLUENCER_TYPES.map((t) => ({ value: t, label: labelOf(t) })), required: true },
    { name: "phone", label: "Phone", type: "tel" },
    { name: "firm", label: "Firm", type: "text" },
    { name: "commissionPct", label: "Commission", type: "number", suffix: "%" },
    { name: "isActive", label: "Active", type: "switch" },
  ],
};

export default function InfluencersPage() {
  const { can } = useSession();
  const [tab, setTab] = useState<"list" | "payouts">("list");
  return (
    <>
      <PageHeader title="Influencers" description="Architects, interior designers, plumbers and masons. Commission/points accrue when the tagged invoice is fully paid." />
      {can("accounts.read") && (
        <div className="mb-3 inline-flex gap-1 rounded-lg bg-fill p-1">
          {(
            [
              ["list", "Influencers"],
              ["payouts", "Commission & payouts"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={cn("rounded-md px-3 py-1.5 text-[13px] font-medium", tab === k ? "bg-[var(--segment-on)] shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {tab === "payouts" && can("accounts.read") ? <InfluencerPayouts /> : <MasterPage config={config} />}
    </>
  );
}
