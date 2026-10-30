"use client";

import Link from "next/link";
import { use } from "react";
import { formatDate, formatINR } from "@gc/shared";
import { InfoGrid, PageHeader, Section } from "@/components/common/page-header";
import { ErrorState, LoadingPage } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { DocActionButton, LinesTable } from "@/components/inventory/doc-actions";
import { useApi } from "@/lib/api";
import { useSession } from "@/lib/session";

interface PO {
  id: string;
  number: string;
  date: string;
  expectedDate: string | null;
  status: string;
  notes: string | null;
  totalPaise: number;
  supplier: { id: string; name: string; gstin: string | null; phone: string | null };
  lines: { id: string; qtyPcs: number; receivedPcs: number; ratePaise: number; gstRate: number; amountPaise: number; text: string; receivedText: string; product: { sku: string; name: string } }[];
}

export default function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = useSession();
  const q = useApi<PO>(`/purchase-orders/${id}`);
  if (q.isLoading) return <LoadingPage />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const po = q.data;
  const write = can("purchase.write");
  const open = ["APPROVED", "PARTIAL"].includes(po.status);
  return (
    <>
      <PageHeader
        title={po.number}
        description={po.supplier.name}
        back={{ href: "/purchase/orders", label: "Purchase orders" }}
        actions={
          <>
            <StatusBadge status={po.status} label={po.status === "APPROVED" ? "Open" : po.status === "PARTIAL" ? "Partly received" : undefined} />
            {write && po.status === "DRAFT" && <DocActionButton path={`/purchase-orders/${id}/approve`} label="Approve & send" invalidate={["/purchase-orders"]} />}
            {write && open && (
              <Button asChild size="sm">
                <Link href={`/purchase/grn/new?poId=${id}`}>Receive goods (GRN)</Link>
              </Button>
            )}
            {write && po.status === "PARTIAL" && <DocActionButton path={`/purchase-orders/${id}/close`} label="Close PO" variant="secondary" confirmText="Close this PO? Pending quantity will not be received." invalidate={["/purchase-orders"]} />}
            {write && ["DRAFT", "APPROVED"].includes(po.status) && <DocActionButton path={`/purchase-orders/${id}/cancel`} label="Cancel" variant="secondary" confirmText="Cancel this purchase order?" invalidate={["/purchase-orders"]} />}
          </>
        }
      />
      <Section className="mb-4">
        <InfoGrid
          items={[
            { label: "PO date", value: formatDate(po.date) },
            { label: "Expected", value: formatDate(po.expectedDate) || "—" },
            { label: "Supplier GSTIN", value: po.supplier.gstin },
            { label: "Total (incl. GST)", value: formatINR(po.totalPaise) },
          ]}
        />
        {po.notes && <p className="mt-3 text-[13px] text-muted-foreground">{po.notes}</p>}
      </Section>
      <Section title="Items">
        <LinesTable head={["Product", "Ordered", "Received", "Rate / pc", "GST", "Amount"]}>
          {po.lines.map((l) => (
            <tr key={l.id} className="border-b border-border/60">
              <td className="p-2"><div className="font-medium">{l.product.name}</div><div className="text-[12px] text-muted-foreground">{l.product.sku}</div></td>
              <td className="p-2 tabular">{l.text}</td>
              <td className="p-2 tabular">{l.receivedPcs ? l.receivedText : "—"}</td>
              <td className="p-2 tabular">{formatINR(l.ratePaise)}</td>
              <td className="p-2 tabular">{l.gstRate}%</td>
              <td className="p-2 text-right font-medium tabular">{formatINR(l.amountPaise)}</td>
            </tr>
          ))}
        </LinesTable>
      </Section>
    </>
  );
}
