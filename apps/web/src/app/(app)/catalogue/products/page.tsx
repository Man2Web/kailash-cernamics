"use client";

import Link from "next/link";
import { ImageOff, Plus, Upload } from "lucide-react";
import { CATEGORY_TYPES, formatINR, labelOf } from "@gc/shared";
import { PageHeader } from "@/components/common/page-header";
import { DataTable } from "@/components/common/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Can } from "@/lib/session";
import { useApi } from "@/lib/api";

interface Product {
  id: string;
  sku: string;
  name: string;
  images: string[];
  uomType: string;
  unitName: string;
  pcsPerBox: number | null;
  sqftPerBox: number | null;
  mrpPaise: number;
  gstRate: number;
  hsn: string;
  isActive: boolean;
  reorderLevelPcs: number;
  brand: { name: string };
  category: { name: string; type: string };
  size: { name: string } | null;
  finish: { name: string } | null;
}

export default function ProductsPage() {
  const brands = useApi<{ items: { id: string; name: string }[] }>("/brands", { pageSize: 200 });
  return (
    <>
      <PageHeader
        title="Products"
        description="Tiles, sanitaryware, CP fittings, accessories and adhesives."
        actions={
          <Can perm="catalogue.write">
            <Button asChild variant="secondary">
              <Link href="/settings/import">
                <Upload className="size-4" /> Import
              </Link>
            </Button>
            <Button asChild>
              <Link href="/catalogue/products/new">
                <Plus className="size-4" /> New product
              </Link>
            </Button>
          </Can>
        }
      />
      <DataTable<Product>
        endpoint="/products"
        exportName="products"
        searchPlaceholder="Search SKU, name, brand, size…"
        rowHref={(p) => `/catalogue/products/${p.id}`}
        filters={[
          { key: "brandId", label: "Brand", options: (brands.data?.items ?? []).map((b) => ({ value: b.id, label: b.name })) },
          { key: "categoryType", label: "Type", options: CATEGORY_TYPES.map((t) => ({ value: t, label: labelOf(t) })) },
          { key: "isActive", label: "Status", options: [{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }] },
        ]}
        columns={[
          {
            id: "image",
            header: "",
            enableHiding: false,
            cell: ({ row }) =>
              row.original.images[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={row.original.images[0]} alt="" className="size-9 rounded-md object-cover" />
              ) : (
                <span className="grid size-9 place-items-center rounded-md bg-fill text-muted-foreground">
                  <ImageOff className="size-4" />
                </span>
              ),
          },
          { accessorKey: "sku", header: "SKU", meta: { sortKey: "sku", className: "font-mono text-[12.5px]" } },
          { accessorKey: "name", header: "Name", meta: { sortKey: "name" }, cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
          { id: "brand", header: "Brand", cell: ({ row }) => row.original.brand?.name, meta: { exportValue: (r) => r.brand?.name } },
          { id: "category", header: "Category", cell: ({ row }) => row.original.category?.name, meta: { exportValue: (r) => r.category?.name } },
          { id: "size", header: "Size", cell: ({ row }) => row.original.size?.name ?? "—", meta: { exportValue: (r) => r.size?.name } },
          { id: "finish", header: "Finish", cell: ({ row }) => row.original.finish?.name ?? "—", meta: { exportValue: (r) => r.finish?.name } },
          { accessorKey: "pcsPerBox", header: "Pcs/box", meta: { align: "right" }, cell: ({ row }) => row.original.pcsPerBox ?? "—" },
          { accessorKey: "sqftPerBox", header: "Sq ft/box", meta: { align: "right" }, cell: ({ row }) => row.original.sqftPerBox?.toFixed(2) ?? "—" },
          { accessorKey: "hsn", header: "HSN" },
          { accessorKey: "gstRate", header: "GST %", meta: { align: "right" } },
          {
            accessorKey: "mrpPaise",
            header: "MRP",
            meta: { align: "right", sortKey: "mrpPaise", exportValue: (r) => r.mrpPaise / 100 },
            cell: ({ row }) => (
              <span>
                {formatINR(row.original.mrpPaise)}
                <span className="text-[11px] text-muted-foreground"> /{row.original.uomType === "PIECE_BOX_AREA" ? "box" : row.original.unitName}</span>
              </span>
            ),
          },
          {
            accessorKey: "isActive",
            header: "Status",
            cell: ({ row }) => <StatusBadge status={row.original.isActive ? "POSTED" : "CANCELLED"} label={row.original.isActive ? "Active" : "Inactive"} />,
            meta: { exportValue: (r) => (r.isActive ? "Active" : "Inactive") },
          },
        ]}
        emptyAction={
          <Can perm="catalogue.write">
            <Button asChild size="sm">
              <Link href="/catalogue/products/new">Add the first product</Link>
            </Button>
          </Can>
        }
      />
    </>
  );
}
