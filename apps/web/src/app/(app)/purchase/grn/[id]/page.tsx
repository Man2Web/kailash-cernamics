"use client";

import Link from "next/link";
import { use } from "react";
import { formatDate, formatINR, labelOf } from "@gc/shared";
import { InfoGrid, PageHeader, Section } from "@/components/common/page-header";
import { ErrorState, LoadingPage } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { DocActionButton, LinesTable } from "@/components/inventory/doc-actions";
import { TotalsBox } from "@/components/purchase/rate";
import { useApi } from "@/lib/api";
import { useSession } from "@/lib/session";

interface Grn {
  id: string;
  number: string;
  date: string;
  status: string;
  truckNo: string | null;
  containerNo: string | null;
  supplierInvoiceNo: string | null;
  freightPaise: number;
  unloadingPaise: number;
  otherChargesPaise: number;
  allocationBasis: string;
  totalValuePaise: number;
  supplier: { name: string; gstin: string | null };
  godown: { name: string };
  po: { id: string; number: string } | null;
  lines: {
    id: string;
    batchNo: string;
    shadeCode: string;
    caliber: string;
    grade: string;
    qtyPcs: number;
    damagedPcs: number;
    ratePaise: number;
    landedRatePaise?: number;
    amountPaise: number;
    text: string;
    rack: { code: string } | null;
    product: { sku: string; name: string; uomType: string };
  }[];
}

export default function GrnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = useSession();
  const q = useApi<Grn>(`/grns/${id}`);
  if (q.isLoading) return <LoadingPage />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const g = q.data;
  const write = can("purchase.write");
  const goods = g.lines.reduce((a, l) => a + l.qtyPcs * l.ratePaise, 0);
  const charges = g.freightPaise + g.unloadingPaise + g.otherChargesPaise;
  return (
    <>
      <PageHeader
        title={g.number}
        description={g.supplier.name}
        back={{ href: "/purchase/grn", label: "GRN" }}
        actions={
          <>
            <StatusBadge status={g.status} />
            {write && g.status === "DRAFT" && <DocActionButton path={`/grns/${id}/post`} label="Post stock" confirmText="Post this GRN? Stock and batch landed cost will update." invalidate={["/grns", "/stock", "/purchase-orders"]} />}
            {write && g.status === "POSTED" && (
              <Button asChild size="sm" variant="secondary">
                <Link href={`/purchase/invoices/new?grnId=${id}`}>Enter purchase invoice</Link>
              </Button>
            )}
            {write && g.status !== "CANCELLED" && <DocActionButton path={`/grns/${id}/cancel`} label="Cancel GRN" variant="secondary" confirmText="Cancel this GRN? Posted stock will be reversed." invalidate={["/grns", "/stock", "/purchase-orders"]} />}
          </>
        }
      />
      <Section className="mb-4">
        <InfoGrid
          items={[
            { label: "Date", value: formatDate(g.date) },
            { label: "Godown", value: g.godown.name },
            { label: "Purchase order", value: g.po ? <Link className="text-tint hover:underline" href={`/purchase/orders/${g.po.id}`}>{g.po.number}</Link> : "Direct" },
            { label: "Supplier invoice", value: g.supplierInvoiceNo },
            { label: "Truck", value: g.truckNo },
            { label: "Container", value: g.containerNo },
            { label: "Charges spread by", value: labelOf(g.allocationBasis) },
            { label: "Supplier GSTIN", value: g.supplier.gstin },
          ]}
        />
      </Section>
      <Section title="Items">
        <LinesTable head={["Product", "Shade / batch", "Rack", "Received", "Damaged", "Rate / pc", ...(can("cost.read") ? ["Landed / pc"] : []), "Amount"]}>
          {g.lines.map((l) => (
            <tr key={l.id} className="border-b border-border/60">
              <td className="p-2"><div className="font-medium">{l.product.name}</div><div className="text-[12px] text-muted-foreground">{l.product.sku}</div></td>
              <td className="p-2">{l.product.uomType === "PIECE_BOX_AREA" ? <span>Shade <b>{l.shadeCode || "?"}</b> · {l.batchNo || "?"} · Cal {l.caliber || "?"} · {labelOf(l.grade)}</span> : "—"}</td>
              <td className="p-2">{l.rack?.code ?? "—"}</td>
              <td className="p-2 tabular">{l.text}</td>
              <td className="p-2 tabular">{l.damagedPcs ? <span className="text-ios-red">{l.damagedPcs} pcs</span> : "—"}</td>
              <td className="p-2 tabular">{formatINR(l.ratePaise)}</td>
              {can("cost.read") && <td className="p-2 tabular">{l.landedRatePaise ? formatINR(l.landedRatePaise) : "—"}</td>}
              <td className="p-2 text-right font-medium tabular">{formatINR(l.qtyPcs * l.ratePaise)}</td>
            </tr>
          ))}
        </LinesTable>
        <div className="mt-4">
          <TotalsBox
            rows={[
              { label: "Goods value", value: formatINR(goods) },
              { label: "Freight", value: formatINR(g.freightPaise) },
              { label: "Unloading", value: formatINR(g.unloadingPaise) },
              { label: "Other charges", value: formatINR(g.otherChargesPaise) },
              { label: "Landed value", value: formatINR(goods + charges), strong: true },
            ]}
          />
        </div>
      </Section>
    </>
  );
}
