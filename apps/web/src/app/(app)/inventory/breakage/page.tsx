"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { BREAKAGE_STAGES, formatDate, formatQty, labelOf } from "@gc/shared";
import { PageHeader } from "@/components/common/page-header";
import { DataTable } from "@/components/common/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { api, useApiMutation } from "@/lib/api";
import { Can, useSession } from "@/lib/session";

interface Row {
  id: string;
  number: string;
  date: string;
  stage: string;
  status: string;
  reason: string;
  qtyPcs: number;
  photos: string[];
  product: { sku: string; name: string; uomType: string; unitName: string | null; pcsPerBox: number | null; sqftPerBox: number | null };
  batch: { batchNo: string; shadeCode: string };
  godown: { name: string };
}

export default function BreakagePage() {
  const { can } = useSession();
  const writeOff = useApiMutation((v: { id: string; reason: string }) => api(`/stock/breakage/${v.id}/write-off`, { method: "POST", body: { reason: v.reason } }), ["/stock", "/approvals"]);
  return (
    <>
      <PageHeader
        title="Breakage"
        description="Broken pieces move from saleable to damaged stock. Damaged stock can be sold on the clearance price list or written off with approval."
        actions={
          <Can perm="stock.breakage">
            <Button asChild size="sm">
              <Link href="/inventory/breakage/new">
                <Plus className="size-4" /> Record breakage
              </Link>
            </Button>
          </Can>
        }
      />
      <DataTable<Row>
        endpoint="/stock/breakage"
        exportName="breakage"
        searchPlaceholder="Search number, product or reason…"
        filters={[
          { key: "stage", label: "Stage", options: BREAKAGE_STAGES.map((s) => ({ value: s, label: labelOf(s) })) },
          { key: "status", label: "Status", options: [{ value: "POSTED", label: "Damaged stock" }, { value: "PENDING_APPROVAL", label: "Write-off pending" }, { value: "COMPLETED", label: "Written off" }] },
        ]}
        rowActions={
          can("stock.breakage")
            ? [
                {
                  label: "Request write-off",
                  hidden: (r) => r.status !== "POSTED",
                  onSelect: (r) => {
                    const reason = prompt(`Write off ${r.number}? Reason:`);
                    if (!reason) return;
                    writeOff.mutate({ id: r.id, reason }, { onSuccess: () => toast.success("Sent for approval"), onError: (e) => toast.error(e.message) });
                  },
                },
              ]
            : undefined
        }
        columns={[
          { accessorKey: "number", header: "Number", meta: { className: "whitespace-nowrap" }, cell: ({ row }) => <span className="font-medium">{row.original.number}</span> },
          { accessorKey: "date", header: "Date", meta: { sortKey: "date", className: "whitespace-nowrap", exportValue: (r) => formatDate(r.date) }, cell: ({ row }) => formatDate(row.original.date) },
          { id: "product", header: "Product", meta: { exportValue: (r) => `${r.product.sku} ${r.product.name}` }, cell: ({ row }) => <div><div className="font-medium">{row.original.product.name}</div><div className="text-[12px] text-muted-foreground">{row.original.product.sku} · shade {row.original.batch.shadeCode}</div></div> },
          { accessorKey: "qtyPcs", header: "Qty", meta: { exportValue: (r) => r.qtyPcs }, cell: ({ row }) => formatQty(row.original.qtyPcs, row.original.product) },
          { accessorKey: "stage", header: "Stage", cell: ({ row }) => labelOf(row.original.stage) },
          { accessorKey: "reason", header: "Reason" },
          { id: "photos", header: "Photos", meta: { exportValue: (r) => r.photos.length }, cell: ({ row }) => row.original.photos.length ? <span className="flex gap-1">{row.original.photos.slice(0, 3).map((p) => <a key={p} href={p} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={p} alt="" className="size-8 rounded object-cover" /></a>)}</span> : "—" },
          { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} label={row.original.status === "POSTED" ? "Damaged" : row.original.status === "COMPLETED" ? "Written off" : undefined} /> },
        ]}
      />
    </>
  );
}
