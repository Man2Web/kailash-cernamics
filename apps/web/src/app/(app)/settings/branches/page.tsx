"use client";

import { useState } from "react";
import { orgBranchSchema, orgGodownSchema, orgRackSchema, STATES, labelOf } from "@gc/shared";
import { PageHeader } from "@/components/common/page-header";
import { MasterPage, type MasterConfig } from "@/components/common/master-page";
import { DataTable } from "@/components/common/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { useApi } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Branch {
  id: string;
  code: string;
  name: string;
  city: string | null;
  stateCode: string;
  gstin: string | null;
  tallyCompanyName: string | null;
  isActive: boolean;
  godowns: { id: string }[];
}
interface Godown {
  id: string;
  code: string;
  name: string;
  isDisplay: boolean;
  isActive: boolean;
  branch: { code: string; name: string };
}
interface Rack {
  id: string;
  code: string;
  name: string | null;
  isActive: boolean;
  godown: { code: string; name: string };
}
interface Series {
  id: string;
  docType: string;
  fy: string;
  prefix: string;
  nextNo: number;
  padding: number;
}

const activeCol = {
  accessorKey: "isActive",
  header: "Status",
  cell: ({ row }: any) => <StatusBadge status={row.original.isActive ? "POSTED" : "CANCELLED"} label={row.original.isActive ? "Active" : "Inactive"} />,
};
const stateOptions = STATES.map((s) => ({ value: s.code, label: `${s.code} · ${s.name}` }));

const branches: MasterConfig<Branch> = {
  title: "Branches",
  singular: "Branch",
  endpoint: "/branches",
  writePerm: "org.write",
  schema: orgBranchSchema,
  defaults: { code: "", name: "", city: "", state: "Tamil Nadu", stateCode: "33", gstin: "", phone: "", address: "", tallyCompanyName: "Kailash Ceramics", isActive: true },
  columns: [
    { accessorKey: "code", header: "Code", meta: { sortKey: "code", className: "font-mono" } },
    { accessorKey: "name", header: "Name", cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { accessorKey: "city", header: "City" },
    { accessorKey: "stateCode", header: "State" },
    { accessorKey: "gstin", header: "GSTIN", meta: { className: "font-mono text-[12px]" } },
    { accessorKey: "tallyCompanyName", header: "Tally company" },
    { id: "godowns", header: "Godowns", cell: ({ row }) => row.original.godowns?.length ?? 0, meta: { align: "right" } },
    activeCol,
  ],
  fields: [
    { name: "code", label: "Code (e.g. CBE)", type: "text", required: true },
    { name: "name", label: "Name", type: "text", required: true },
    { name: "city", label: "City", type: "text" },
    { name: "state", label: "State name", type: "text" },
    { name: "stateCode", label: "State code", type: "select", options: stateOptions, required: true },
    { name: "gstin", label: "GSTIN", type: "text" },
    { name: "phone", label: "Phone", type: "tel" },
    { name: "tallyCompanyName", label: "Tally company name", type: "text" },
    { name: "address", label: "Address", type: "textarea" },
    { name: "isActive", label: "Active", type: "switch" },
  ],
};

const godowns: MasterConfig<Godown> = {
  title: "Godowns",
  singular: "Godown",
  endpoint: "/godowns",
  writePerm: "org.write",
  schema: orgGodownSchema,
  defaults: { branchId: "", code: "", name: "", isDisplay: false, isActive: true },
  columns: [
    { id: "branch", header: "Branch", cell: ({ row }) => row.original.branch?.code, meta: { exportValue: (r) => r.branch?.code } },
    { accessorKey: "code", header: "Code", meta: { sortKey: "code", className: "font-mono" } },
    { accessorKey: "name", header: "Name", cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { accessorKey: "isDisplay", header: "Showroom", cell: ({ row }) => (row.original.isDisplay ? "Yes" : "No") },
    activeCol,
  ],
  fields: [
    { name: "branchId", label: "Branch", type: "entity", endpoint: "/branches", getLabel: (b) => `${b.code} · ${b.name}`, required: true },
    { name: "code", label: "Code", type: "text", required: true },
    { name: "name", label: "Name", type: "text", required: true },
    { name: "isDisplay", label: "Showroom (display stock)", type: "switch" },
    { name: "isActive", label: "Active", type: "switch" },
  ],
};

const racks: MasterConfig<Rack> = {
  title: "Racks",
  singular: "Rack",
  endpoint: "/racks",
  writePerm: "org.write",
  schema: orgRackSchema,
  defaults: { godownId: "", code: "", name: "", isActive: true },
  columns: [
    { id: "godown", header: "Godown", cell: ({ row }) => `${row.original.godown?.code} · ${row.original.godown?.name}`, meta: { exportValue: (r) => r.godown?.code } },
    { accessorKey: "code", header: "Code", meta: { sortKey: "code", className: "font-mono" } },
    { accessorKey: "name", header: "Name" },
    activeCol,
  ],
  fields: [
    { name: "godownId", label: "Godown", type: "entity", endpoint: "/godowns", getLabel: (g) => `${g.code} · ${g.name}`, required: true },
    { name: "code", label: "Code", type: "text", required: true },
    { name: "name", label: "Name", type: "text" },
    { name: "isActive", label: "Active", type: "switch" },
  ],
};

function NumberSeries() {
  const b = useApi<{ items: { id: string; code: string }[] }>("/branches", { pageSize: 100 });
  return (
    <DataTable<Series>
      endpoint="/number-series"
      exportName="number-series"
      filters={[{ key: "branchId", label: "Branch", options: (b.data?.items ?? []).map((x) => ({ value: x.id, label: x.code })) }]}
      emptyTitle="No numbers issued yet"
      columns={[
        { accessorKey: "docType", header: "Document", cell: ({ row }) => labelOf(row.original.docType) },
        { accessorKey: "fy", header: "Financial year" },
        { accessorKey: "prefix", header: "Prefix", meta: { className: "font-mono" } },
        { accessorKey: "nextNo", header: "Next number", meta: { align: "right" } },
        { accessorKey: "padding", header: "Digits", meta: { align: "right" } },
      ]}
    />
  );
}

const TABS = { branches: "Branches", godowns: "Godowns", racks: "Racks", series: "Number series" } as const;

export default function BranchesPage() {
  const [tab, setTab] = useState<keyof typeof TABS>("branches");
  return (
    <>
      <PageHeader title="Branches & godowns" description="Branches (GSTIN, state, Tally company), godowns and showrooms, racks and document number series." />
      <div className="mb-3 inline-flex flex-wrap gap-1 rounded-lg bg-fill p-1">
        {Object.entries(TABS).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k as keyof typeof TABS)}
            className={cn("rounded-md px-3 py-1.5 text-[13px] font-medium", tab === k ? "bg-[var(--segment-on)] shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "branches" && <MasterPage key="b" config={branches} />}
      {tab === "godowns" && <MasterPage key="g" config={godowns} />}
      {tab === "racks" && <MasterPage key="r" config={racks} />}
      {tab === "series" && <NumberSeries />}
    </>
  );
}
