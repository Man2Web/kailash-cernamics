"use client";

import { use } from "react";
import { formatDate, formatDateTime, formatINR } from "@gc/shared";
import { useApi } from "@/lib/api";
import { fmtQty } from "@/components/sales/sales-kit";
import { HsnSummary, Letterhead, PartyBlock, PrintBar, PrintTotals, Sheet, Signatures } from "@/components/sales/print-kit";

export default function PrintInvoice({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const q = useApi<any>(`/invoices/${id}`);
  if (q.isLoading) return <p className="p-6 text-center">Loading…</p>;
  if (!q.data) return <p className="p-6 text-center">Invoice not found.</p>;
  const d = q.data;
  const inter = d.isInterState;
  return (
    <>
      <PrintBar title={`Invoice ${d.number ?? "(draft)"}`} />
      <Sheet>
        {d.status === "CANCELLED" && <div className="mb-2 rounded border-2 border-red-600 p-1 text-center text-[14px] font-bold text-red-600">CANCELLED — {d.cancelReason}</div>}
        {d.status === "DRAFT" && <div className="mb-2 rounded border-2 border-neutral-400 p-1 text-center text-[14px] font-bold text-neutral-500">DRAFT — NOT A VALID INVOICE</div>}
        <Letterhead
          branch={d.branch}
          docTitle="Tax Invoice"
          number={d.number ?? "DRAFT"}
          date={d.date}
          extra={
            <>
              {d.dueDate && <div className="text-[12px]">Due: {formatDate(d.dueDate)}</div>}
              {d.salesOrder && <div className="text-[12px]">Order: {d.salesOrder.number}</div>}
              {d.irn && <div className="max-w-[60mm] text-[9px] break-all">IRN: {d.irn}</div>}
              {d.ackNo && (
                <div className="text-[11px]">
                  Ack No: {d.ackNo}
                  {d.ackDate ? ` · ${formatDateTime(d.ackDate)}` : ""}
                </div>
              )}
              {d.ewayBillNo && <div className="text-[12px]">E-way bill: {d.ewayBillNo}</div>}
            </>
          }
        />
        <PartyBlock title="Bill to" party={d.party} site={d.site} placeOfSupply={d.placeOfSupply} />
        <table className="text-[11px]">
          <thead>
            <tr>
              <th>#</th>
              <th>Description</th>
              <th>HSN</th>
              <th>Shade / batch</th>
              <th className="num">Quantity</th>
              <th className="num">Rate</th>
              <th className="num">Disc</th>
              <th className="num">Taxable</th>
              <th className="num">GST</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {d.lines.map((l: any, i: number) => (
              <tr key={l.id}>
                <td>{i + 1}</td>
                <td>
                  <div className="font-medium">{l.product?.name}</div>
                  <div className="text-neutral-500">
                    {l.product?.sku}
                    {l.product?.size?.name ? ` · ${l.product.size.name}` : ""}
                  </div>
                </td>
                <td>{l.hsn}</td>
                <td>{l.batch && l.batch.batchNo !== "DEFAULT" ? `${l.batch.shadeCode} / ${l.batch.batchNo}` : "—"}</td>
                <td className="num">{fmtQty(l.qtyPcs, l.product)}</td>
                <td className="num">{formatINR(l.ratePaise)}/{l.product?.uomType === "PIECE_BOX_AREA" ? "pc" : l.product?.unitName || "nos"}</td>
                <td className="num">{l.discountPct ? `${l.discountPct}%` : ""}</td>
                <td className="num">{formatINR(l.taxablePaise)}</td>
                <td className="num">{l.gstRate}%</td>
                <td className="num">{formatINR(l.amountPaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <HsnSummary lines={d.lines} inter={inter} />
        <PrintTotals doc={d} />
        <div className="mt-4 text-[11px] text-neutral-700">
          Goods once sold are taken back only as per the return policy. Breakage after delivery is not covered. Subject to Coimbatore jurisdiction.
          {d.notes && <div className="mt-1">Note: {d.notes}</div>}
        </div>
        <Signatures company={d.branch?.company?.name} />
      </Sheet>
    </>
  );
}
