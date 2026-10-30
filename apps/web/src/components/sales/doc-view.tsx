"use client";

import { formatBoxes, formatINR, stateName } from "@gc/shared";
import { Section } from "@/components/common/page-header";
import { fmtQty, TotalsPanel } from "./sales-kit";

/** Read-only lines table for posted/confirmed documents. */
export function LinesTable({ lines, interState, showTax = true }: { lines: any[]; interState: boolean; showTax?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-[13px]">
        <thead>
          <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
            <th className="py-2">#</th>
            <th className="py-2">Product</th>
            <th className="py-2">HSN</th>
            <th className="py-2">Batch / shade</th>
            <th className="py-2 text-right">Quantity</th>
            <th className="py-2 text-right">Rate / pc</th>
            <th className="py-2 text-right">Disc</th>
            <th className="py-2 text-right">Taxable</th>
            {showTax && <th className="py-2 text-right">{interState ? "IGST" : "CGST + SGST"}</th>}
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const tax = Number(l.taxPaise ?? Number(l.cgstPaise ?? 0) + Number(l.sgstPaise ?? 0) + Number(l.igstPaise ?? 0));
            return (
              <tr key={l.id} className="border-b border-border/60 align-top">
                <td className="py-2 text-muted-foreground">{i + 1}</td>
                <td className="py-2">
                  <div className="font-medium">{l.product?.name}</div>
                  <div className="text-[11.5px] text-muted-foreground">
                    {l.product?.sku}
                    {l.product?.size?.name ? ` · ${l.product.size.name}` : ""}
                  </div>
                </td>
                <td className="py-2 tabular">{l.hsn ?? l.product?.hsn}</td>
                <td className="py-2">{l.batch && l.batch.batchNo !== "DEFAULT" ? `${l.batch.shadeCode} · ${l.batch.batchNo} · ${l.batch.caliber}` : "—"}</td>
                <td className="py-2 text-right tabular">
                  {fmtQty(l.qtyPcs, l.product)}
                  {l.invoicedPcs > 0 && <div className="text-[11px] text-muted-foreground">invoiced {formatBoxes(l.invoicedPcs, l.product?.pcsPerBox)}</div>}
                </td>
                <td className="py-2 text-right tabular">{formatINR(l.ratePaise)}</td>
                <td className="py-2 text-right tabular">{l.discountPct ? `${l.discountPct}%` : "—"}</td>
                <td className="py-2 text-right tabular">{formatINR(l.taxablePaise)}</td>
                {showTax && (
                  <td className="py-2 text-right tabular">
                    {formatINR(tax)}
                    <div className="text-[11px] text-muted-foreground">{l.gstRate}%</div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function DocSummary({ doc, extra }: { doc: any; extra?: React.ReactNode }) {
  const interState = doc.isInterState ?? doc.igstPaise > 0;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-4">
        <Section>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4">
            <div>
              <dt className="text-[12px] text-muted-foreground">Customer</dt>
              <dd className="font-medium">{doc.party?.name ?? doc.customerName}</dd>
              {doc.party?.gstin && <dd className="text-[12px] text-muted-foreground">GSTIN {doc.party.gstin}</dd>}
            </div>
            <div>
              <dt className="text-[12px] text-muted-foreground">Site</dt>
              <dd className="font-medium">{doc.site?.name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-muted-foreground">Place of supply</dt>
              <dd className="font-medium">
                {stateName(doc.placeOfSupply)} ({doc.placeOfSupply})
              </dd>
            </div>
            <div>
              <dt className="text-[12px] text-muted-foreground">Phone</dt>
              <dd className="font-medium">{doc.party?.phone ?? "—"}</dd>
            </div>
          </dl>
          {doc.notes && <p className="mt-3 text-[13px] text-muted-foreground">{doc.notes}</p>}
        </Section>
        <Section title="Items">
          <LinesTable lines={doc.lines} interState={interState} />
        </Section>
        {extra}
      </div>
      <div className="lg:sticky lg:top-20 lg:self-start">
        <TotalsPanel t={{ ...doc, subtotalPaise: Number(doc.subtotalPaise), totalPaise: Number(doc.totalPaise) }} interState={interState} />
      </div>
    </div>
  );
}
