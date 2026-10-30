"use client";

import { useState } from "react";
import { brandSchema, categorySchema, colorSchema, finishSchema, seriesSchema, sizeSchema, CATEGORY_TYPES, labelOf } from "@gc/shared";
import { PageHeader } from "@/components/common/page-header";
import { MasterPage, type MasterConfig } from "@/components/common/master-page";
import { StatusBadge } from "@/components/common/status-badge";
import { cn } from "@/lib/utils";

type Row = { id: string; name: string; isActive: boolean; [k: string]: any };

const active = { id: "isActive", header: "Status", cell: ({ row }: any) => <StatusBadge status={row.original.isActive ? "POSTED" : "CANCELLED"} label={row.original.isActive ? "Active" : "Inactive"} />, meta: { exportValue: (r: Row) => (r.isActive ? "Active" : "Inactive") } };
const name = { accessorKey: "name", header: "Name", meta: { sortKey: "name" }, cell: ({ row }: any) => <span className="font-medium">{row.original.name}</span> };
const activeFilter = { key: "isActive", label: "Status", options: [{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }] };

const TABS: Record<string, MasterConfig<Row>> = {
  brands: {
    title: "Brands", singular: "Brand", endpoint: "/brands", writePerm: "catalogue.write", schema: brandSchema,
    defaults: { name: "", code: "", isActive: true, supplierId: null, leadTimeDays: 15 },
    columns: [name, { accessorKey: "code", header: "Code" }, { accessorKey: "leadTimeDays", header: "Lead time (days)", meta: { align: "right" } }, active],
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "code", label: "Short code", type: "text" },
      { name: "supplierId", label: "Preferred supplier (reorder planner)", type: "entity", endpoint: "/parties", params: { type: "SUPPLIER" }, getLabel: (p) => p.name },
      { name: "leadTimeDays", label: "Lead time, PO to delivery", type: "number", integer: true, suffix: "days" },
      { name: "isActive", label: "Active", type: "switch" },
    ],
    filters: [activeFilter],
  },
  categories: {
    title: "Categories", singular: "Category", endpoint: "/categories", writePerm: "catalogue.write", schema: categorySchema,
    defaults: { name: "", type: "TILE", isActive: true },
    columns: [name, { accessorKey: "type", header: "Type", cell: ({ row }) => labelOf(row.original.type) }, active],
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "type", label: "Type", type: "select", options: CATEGORY_TYPES.map((t) => ({ value: t, label: labelOf(t) })), required: true },
      { name: "isActive", label: "Active", type: "switch" },
    ],
    filters: [{ key: "type", label: "Type", options: CATEGORY_TYPES.map((t) => ({ value: t, label: labelOf(t) })) }, activeFilter],
  },
  series: {
    title: "Series", singular: "Series", endpoint: "/series", writePerm: "catalogue.write", schema: seriesSchema,
    defaults: { name: "", brandId: null, isActive: true },
    columns: [name, { id: "brand", header: "Brand", cell: ({ row }) => row.original.brand?.name ?? "—", meta: { exportValue: (r) => r.brand?.name } }, active],
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "brandId", label: "Brand", type: "entity", endpoint: "/brands", getLabel: (b) => b.name },
      { name: "isActive", label: "Active", type: "switch" },
    ],
  },
  sizes: {
    title: "Sizes", singular: "Size", endpoint: "/sizes", writePerm: "catalogue.write", schema: sizeSchema,
    defaults: { name: "", lengthMm: 600, widthMm: 600, thicknessMm: 9, isActive: true },
    columns: [name, { accessorKey: "lengthMm", header: "Length (mm)", meta: { align: "right" } }, { accessorKey: "widthMm", header: "Width (mm)", meta: { align: "right" } }, { accessorKey: "thicknessMm", header: "Thickness (mm)", meta: { align: "right" } }, active],
    fields: [
      { name: "name", label: "Name (e.g. 600x1200)", type: "text", required: true },
      { name: "lengthMm", label: "Length", type: "number", integer: true, suffix: "mm", required: true },
      { name: "widthMm", label: "Width", type: "number", integer: true, suffix: "mm", required: true },
      { name: "thicknessMm", label: "Thickness", type: "number", suffix: "mm" },
      { name: "isActive", label: "Active", type: "switch" },
    ],
  },
  finishes: {
    title: "Finishes", singular: "Finish", endpoint: "/finishes", writePerm: "catalogue.write", schema: finishSchema,
    defaults: { name: "", isActive: true },
    columns: [name, active],
    fields: [{ name: "name", label: "Name", type: "text", required: true }, { name: "isActive", label: "Active", type: "switch" }],
  },
  colors: {
    title: "Colours", singular: "Colour", endpoint: "/colors", writePerm: "catalogue.write", schema: colorSchema,
    defaults: { name: "", hex: "", isActive: true },
    columns: [
      { ...name, cell: ({ row }: any) => <span className="flex items-center gap-2 font-medium">{row.original.hex && <span className="size-3.5 rounded-full border" style={{ background: row.original.hex }} />}{row.original.name}</span> },
      { accessorKey: "hex", header: "Hex" },
      active,
    ],
    fields: [{ name: "name", label: "Name", type: "text", required: true }, { name: "hex", label: "Hex colour (#RRGGBB)", type: "text" }, { name: "isActive", label: "Active", type: "switch" }],
  },
};

export default function MastersPage() {
  const [tab, setTab] = useState<keyof typeof TABS>("brands");
  return (
    <>
      <PageHeader title="Brands & masters" description="Brands, categories, series, sizes, finishes and colours used on products." />
      <div className="mb-3 inline-flex flex-wrap gap-1 rounded-lg bg-fill p-1">
        {Object.entries(TABS).map(([k, c]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn("rounded-md px-3 py-1.5 text-[13px] font-medium", tab === k ? "bg-[var(--segment-on)] shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            {c.title}
          </button>
        ))}
      </div>
      <MasterPage key={tab} config={TABS[tab]} />
    </>
  );
}
