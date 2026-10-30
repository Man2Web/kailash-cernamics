"use client";

import { Fragment, use } from "react";
import { formatDate, formatINR, labelOf } from "@gc/shared";
import { useApi } from "@/lib/api";
import { fmtQty } from "@/components/sales/sales-kit";
import { Letterhead, PartyBlock, PrintBar, PrintTotals, Sheet, Signatures } from "@/components/sales/print-kit";

function rateLabel(l: any) {
  const basis = l.priceBasis === "PER_SQFT" ? "/sq ft" : l.priceBasis === "PER_BOX" ? "/box" : l.product?.uomType === "PIECE_BOX_AREA" ? "/pc" : `/${l.product?.unitName || "nos"}`;
  return `${formatINR(l.enteredRatePaise)}${basis}`;
}

function Thumb({ src }: { src?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="" className="size-10 rounded object-cover" /> : <div className="size-10 rounded bg-neutral-100" />;
}

export default function PrintQuotation({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const q = useApi<any>(`/quotations/${id}`);
  if (q.isLoading) return <p className="p-6 text-center">Loading…</p>;
  if (!q.data) return <p className="p-6 text-center">Quotation not found.</p>;
  const d = q.data;
  const inter = Number(d.igstPaise) > 0;
  let n = 0;
  return (
    <>
      <PrintBar title={`Quotation ${d.number}${d.revisionNo > 1 ? ` Rev ${d.revisionNo}` : ""}`} />
      <Sheet>
        <Letterhead
          branch={d.branch}
          docTitle="Quotation"
          number={`${d.number}${d.revisionNo > 1 ? ` (Rev ${d.revisionNo})` : ""}`}
          date={d.date}
          extra={<div className="text-[12px]">Valid till: {formatDate(d.validUntil)}</div>}
        />
        <PartyBlock title="Quotation for" party={d.party} name={d.customerName} phone={d.customerPhone} placeOfSupply={d.placeOfSupply} />
        <table className="text-[11px]">
          <thead>
            <tr>
              <th>#</th>
              <th />
              <th>Room / area · Product</th>
              <th className="num">Area</th>
              <th className="num">Quantity</th>
              <th className="num">Rate</th>
              <th className="num">Disc</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {d.rooms.map((r: any) => (
              <Fragment key={r.id}>
                <tr>
                  <td colSpan={8} className="bg-neutral-50 font-semibold">
                    {r.name} — {r.lengthFt} × {r.widthFt} ft{r.heightFt ? ` × ${r.heightFt} ft high` : ""}
                  </td>
                </tr>
                {r.areas.flatMap((a: any) =>
                  a.lines.map((l: any) => (
                    <tr key={l.id}>
                      <td>{++n}</td>
                      <td>
                        <Thumb src={l.product?.images?.[0]} />
                      </td>
                      <td>
                        <div className="font-medium">
                          {labelOf(a.areaType)}: {l.product?.name}
                        </div>
                        <div className="text-neutral-500">
                          {l.product?.sku} · {l.product?.size?.name ?? ""} · HSN {l.product?.hsn} · wastage {a.wastagePct}%
                        </div>
                      </td>
                      <td className="num">{Number(a.areaSqft).toFixed(1)} sq ft</td>
                      <td className="num">{fmtQty(l.qtyPcs, l.product)}</td>
                      <td className="num">{rateLabel(l)}</td>
                      <td className="num">{l.discountPct ? `${l.discountPct}%` : ""}</td>
                      <td className="num">{formatINR(l.taxablePaise)}</td>
                    </tr>
                  )),
                )}
              </Fragment>
            ))}
            {d.lines.length > 0 && (
              <tr>
                <td colSpan={8} className="bg-neutral-50 font-semibold">
                  Other items
                </td>
              </tr>
            )}
            {d.lines.map((l: any) => (
              <tr key={l.id}>
                <td>{++n}</td>
                <td>
                  <Thumb src={l.product?.images?.[0]} />
                </td>
                <td>
                  <div className="font-medium">{l.product?.name}</div>
                  <div className="text-neutral-500">
                    {l.product?.sku} · HSN {l.product?.hsn}
                  </div>
                </td>
                <td />
                <td className="num">{fmtQty(l.qtyPcs, l.product)}</td>
                <td className="num">{rateLabel(l)}</td>
                <td className="num">{l.discountPct ? `${l.discountPct}%` : ""}</td>
                <td className="num">{formatINR(l.taxablePaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <PrintTotals doc={d} />
        <div className="mt-4 text-[11px]">
          <div className="font-semibold">Terms</div>
          <ul className="list-disc pl-4 text-neutral-700">
            <li>Prices include GST as shown ({inter ? "IGST" : "CGST + SGST"}). Valid till {formatDate(d.validUntil)}.</li>
            <li>Quantities include wastage and are rounded up to full boxes. Shade and caliber are subject to stock at the time of order.</li>
            <li>Transport and loading charged as shown; unloading at site by customer unless agreed.</li>
            {d.notes && <li>{d.notes}</li>}
          </ul>
        </div>
        <Signatures company={d.branch?.company?.name} />
      </Sheet>
    </>
  );
}
