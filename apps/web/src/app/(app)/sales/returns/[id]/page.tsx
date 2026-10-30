"use client";

import { use } from "react";
import Link from "next/link";
import { formatDate, formatINR, labelOf } from "@gc/shared";
import { PageHeader, Section, InfoGrid } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorState, LoadingPage } from "@/components/common/states";
import { fmtQty } from "@/components/sales/sales-kit";
import { useApi } from "@/lib/api";

export default function ReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const q = useApi<any>(`/sales-returns/${id}`);
  if (q.isLoading) return <LoadingPage />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const r = q.data;
  const cn = r.creditNote;
  return (
    <>
      <PageHeader
        back={{ href: "/sales/returns", label: "Returns" }}
        title={
          <span className="flex items-center gap-2">
            {r.number} <StatusBadge status={r.status} />
          </span>
        }
        description={`${r.party?.name} · ${formatDate(r.date)}`}
        actions={
          <Link className="text-[13px] text-tint hover:underline" href={`/sales/invoices/${r.invoice.id}`}>
            Invoice {r.invoice.number}
          </Link>
        }
      />
      <div className="space-y-4">
        <Section title="Returned items">
          <ul className="divide-y divide-border text-[13px]">
            {r.lines.map((l: any) => (
              <li key={l.id} className="flex items-center justify-between gap-2 py-2">
                <div>
                  <div className="font-medium">{l.product.name}</div>
                  <div className="text-[12px] text-muted-foreground">
                    {l.product.sku}
                    {l.batch && l.batch.batchNo !== "DEFAULT" ? ` · shade ${l.batch.shadeCode}` : ""}
                  </div>
                </div>
                <span className="flex items-center gap-3">
                  <StatusBadge status={l.toStockType} />
                  <span className="tabular">{fmtQty(l.qtyPcs, l.product)}</span>
                  <span className="w-28 text-right tabular">{formatINR(l.amountPaise)}</span>
                </span>
              </li>
            ))}
          </ul>
          {r.reason && <p className="mt-3 text-[13px] text-muted-foreground">Reason: {r.reason}</p>}
        </Section>
        {cn && (
          <Section title={`Credit note ${cn.number}`}>
            <InfoGrid
              items={[
                { label: "Taxable", value: formatINR(cn.taxablePaise) },
                { label: Number(cn.igstPaise) ? "IGST" : "CGST + SGST", value: formatINR(Number(cn.igstPaise) || Number(cn.cgstPaise) + Number(cn.sgstPaise)) },
                { label: "Total", value: formatINR(cn.totalPaise) },
                { label: "Tally", value: labelOf(cn.syncStatus) },
              ]}
            />
          </Section>
        )}
      </div>
    </>
  );
}
