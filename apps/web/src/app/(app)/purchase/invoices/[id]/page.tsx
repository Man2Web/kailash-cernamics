"use client";

import { use } from "react";
import { AlertTriangle } from "lucide-react";
import { formatDate, formatINR } from "@gc/shared";
import { InfoGrid, PageHeader, Section } from "@/components/common/page-header";
import { ErrorState, LoadingPage } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { DocActionButton, LinesTable } from "@/components/inventory/doc-actions";
import { TotalsBox } from "@/components/purchase/rate";
import { useApi } from "@/lib/api";
import { useSession } from "@/lib/session";

interface PI {
  id: string;
  number: string;
  supplierInvoiceNo: string;
  date: string;
  dueDate: string | null;
  status: string;
  syncStatus: string;
  isInterState: boolean;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  otherChargesPaise: number;
  roundOffPaise: number;
  totalPaise: number;
  paidPaise: number;
  warnings: string[];
  supplier: { name: string; gstin: string | null };
  lines: { id: string; qtyPcs: number; ratePaise: number; gstRate: number; taxablePaise: number; taxPaise: number; amountPaise: number; text: string; product: { sku: string; name: string; hsn: string } }[];
}

export default function PurchaseInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = useSession();
  const q = useApi<PI>(`/purchase-invoices/${id}`);
  if (q.isLoading) return <LoadingPage />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const p = q.data;
  const write = can("purchase.write");
  return (
    <>
      <PageHeader
        title={p.number}
        description={`${p.supplier.name} · bill ${p.supplierInvoiceNo}`}
        back={{ href: "/purchase/invoices", label: "Purchase invoices" }}
        actions={
          <>
            <StatusBadge status={p.status} />
            {p.status !== "DRAFT" && <StatusBadge status={p.syncStatus === "PENDING" ? "PENDING" : p.syncStatus} label={p.syncStatus === "PENDING" ? "Tally sync pending" : undefined} />}
            {write && p.status === "DRAFT" && <DocActionButton path={`/purchase-invoices/${id}/post`} label="Post" confirmText="Post this purchase invoice? It will be sent to Tally." invalidate={["/purchase-invoices"]} />}
            {write && p.status !== "CANCELLED" && <DocActionButton path={`/purchase-invoices/${id}/cancel`} label="Cancel" variant="secondary" confirmText="Cancel this purchase invoice?" invalidate={["/purchase-invoices"]} />}
          </>
        }
      />
      {p.warnings.length > 0 && (
        <div className="mb-4 rounded-xl bg-ios-orange/10 p-4 text-[13px]">
          <div className="mb-1 flex items-center gap-2 font-semibold text-ios-orange">
            <AlertTriangle className="size-4" /> Variance against PO / GRN
          </div>
          <ul className="list-disc pl-5">
            {p.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        </div>
      )}
      <Section className="mb-4">
        <InfoGrid
          items={[
            { label: "Bill date", value: formatDate(p.date) },
            { label: "Due date", value: formatDate(p.dueDate) || "—" },
            { label: "Supplier GSTIN", value: p.supplier.gstin },
            { label: "Tax type", value: p.isInterState ? "IGST (inter-state)" : "CGST + SGST" },
          ]}
        />
      </Section>
      <Section title="Items">
        <LinesTable head={["Product", "HSN", "Quantity", "Rate / pc", "GST", "Taxable", "Total"]}>
          {p.lines.map((l) => (
            <tr key={l.id} className="border-b border-border/60">
              <td className="p-2"><div className="font-medium">{l.product.name}</div><div className="text-[12px] text-muted-foreground">{l.product.sku}</div></td>
              <td className="p-2">{l.product.hsn}</td>
              <td className="p-2 tabular">{l.text}</td>
              <td className="p-2 tabular">{formatINR(l.ratePaise)}</td>
              <td className="p-2 tabular">{l.gstRate}%</td>
              <td className="p-2 tabular">{formatINR(l.taxablePaise)}</td>
              <td className="p-2 text-right font-medium tabular">{formatINR(l.amountPaise)}</td>
            </tr>
          ))}
        </LinesTable>
        <div className="mt-4">
          <TotalsBox
            rows={[
              { label: "Taxable value", value: formatINR(p.taxablePaise) },
              ...(p.isInterState ? [{ label: "IGST", value: formatINR(p.igstPaise) }] : [{ label: "CGST", value: formatINR(p.cgstPaise) }, { label: "SGST", value: formatINR(p.sgstPaise) }]),
              { label: "Other charges", value: formatINR(p.otherChargesPaise) },
              { label: "Round off", value: formatINR(p.roundOffPaise) },
              { label: "Total", value: formatINR(p.totalPaise), strong: true },
              { label: "Paid", value: formatINR(p.paidPaise) },
            ]}
          />
        </div>
      </Section>
    </>
  );
}
