"use client";

import { useRouter } from "next/navigation";
import { priceListSchema, SEGMENTS, labelOf } from "@gc/shared";
import { PageHeader } from "@/components/common/page-header";
import { MasterPage, type MasterConfig } from "@/components/common/master-page";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";

interface PriceList {
  id: string;
  name: string;
  segment: string;
  isActive: boolean;
  itemCount: number;
}

export default function PriceListsPage() {
  const router = useRouter();
  const config: MasterConfig<PriceList> = {
    title: "Price lists",
    singular: "Price list",
    endpoint: "/price-lists",
    writePerm: "price.write",
    schema: priceListSchema,
    defaults: { name: "", segment: "RETAIL", isActive: true },
    filters: [{ key: "segment", label: "Segment", options: SEGMENTS.map((s) => ({ value: s, label: labelOf(s) })) }],
    columns: [
      { accessorKey: "name", header: "Name", meta: { sortKey: "name" }, cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
      { accessorKey: "segment", header: "Customer segment", cell: ({ row }) => labelOf(row.original.segment) },
      { accessorKey: "itemCount", header: "Products priced", meta: { align: "right" } },
      {
        accessorKey: "isActive",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.isActive ? "POSTED" : "CANCELLED"} label={row.original.isActive ? "Active" : "Inactive"} />,
      },
      {
        id: "open",
        header: "",
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="secondary"
            className="h-7"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/catalogue/price-lists/${row.original.id}`);
            }}
          >
            Edit prices
          </Button>
        ),
      },
    ],
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "segment", label: "Customer segment", type: "select", options: SEGMENTS.map((s) => ({ value: s, label: labelOf(s) })), required: true },
      { name: "isActive", label: "Active", type: "switch" },
    ],
  };
  return (
    <>
      <PageHeader title="Price lists" description="One price list per customer segment. Prices can be per sq ft, per box or per unit; lines store the per-piece rate." />
      <MasterPage config={config} />
    </>
  );
}
