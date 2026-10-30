"use client";

import { amountInWords, formatDate, formatINR, stateName } from "@gc/shared";

export function PrintBar({ title }: { title: string }) {
  return (
    <div className="no-print mx-auto mb-4 flex w-[210mm] max-w-full items-center justify-between px-2">
      <span className="text-[13px] text-neutral-600">{title}</span>
      <button onClick={() => window.print()} className="rounded-md bg-[#1d6a86] px-4 py-2 text-[13px] font-medium text-white hover:opacity-90">
        Print / Save PDF
      </button>
    </div>
  );
}

export function Sheet({ children }: { children: React.ReactNode }) {
  return <div className="sheet mx-auto min-h-[297mm] w-[210mm] max-w-full bg-white p-[12mm] shadow-lg">{children}</div>;
}

export function Letterhead({ branch, docTitle, number, date, extra }: { branch: any; docTitle: string; number: string; date: string; extra?: React.ReactNode }) {
  const company = branch?.company ?? {};
  return (
    <div className="mb-4 flex items-start justify-between gap-4 border-b-2 border-[#1d6a86] pb-3">
      <div className="flex items-start gap-3">
        <div className="grid size-12 shrink-0 grid-cols-2 gap-[2px] rounded-md bg-[#1d6a86] p-[4px]">
          <span className="rounded-[2px] bg-white" />
          <span className="rounded-[2px] bg-white/60" />
          <span className="rounded-[2px] bg-white/60" />
          <span className="rounded-[2px] bg-white" />
        </div>
        <div>
          <div className="text-[20px] font-bold text-[#1d6a86]">{company.name ?? "Kailash Ceramics"}</div>
          <div className="text-[11px] text-neutral-600">Tiles · Sanitaryware · CP fittings</div>
          <div className="mt-1 text-[11px] leading-snug">
            {branch?.address ? `${branch.address}, ` : ""}
            {branch?.city} {branch?.state ? `, ${branch.state}` : ""}
            <br />
            {branch?.gstin && <>GSTIN: {branch.gstin} · </>}State: {stateName(branch?.stateCode)} ({branch?.stateCode})
            {branch?.phone && <> · Ph: {branch.phone}</>}
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-[16px] font-bold uppercase tracking-wide">{docTitle}</div>
        <div className="mt-1 text-[12px]">
          No: <b>{number}</b>
        </div>
        <div className="text-[12px]">Date: {formatDate(date)}</div>
        {extra}
      </div>
    </div>
  );
}

export function PartyBlock({ title, party, name, phone, site, placeOfSupply }: { title: string; party?: any; name?: string | null; phone?: string | null; site?: any; placeOfSupply: string }) {
  return (
    <div className="mb-3 grid grid-cols-2 gap-3 text-[11.5px]">
      <div className="rounded border border-neutral-300 p-2">
        <div className="text-[10px] font-semibold uppercase text-neutral-500">{title}</div>
        <div className="text-[13px] font-semibold">{party?.name ?? name ?? "—"}</div>
        {party?.billingAddress && <div>{party.billingAddress}</div>}
        {(party?.phone ?? phone) && <div>Ph: {party?.phone ?? phone}</div>}
        {party?.gstin && <div>GSTIN: {party.gstin}</div>}
      </div>
      <div className="rounded border border-neutral-300 p-2">
        <div className="text-[10px] font-semibold uppercase text-neutral-500">Place of supply</div>
        <div className="text-[13px] font-semibold">
          {stateName(placeOfSupply)} ({placeOfSupply})
        </div>
        {site && (
          <div className="mt-1">
            Site: {site.name}
            {site.address ? `, ${site.address}` : ""}
          </div>
        )}
      </div>
    </div>
  );
}

export function PrintTotals({ doc }: { doc: any }) {
  const inter = Number(doc.igstPaise) > 0;
  const charges = Number(doc.transportPaise ?? 0) + Number(doc.loadingPaise ?? 0);
  const rows: [string, number][] = [
    ["Taxable value", Number(doc.taxablePaise)],
    ...(charges ? ([["Transport & loading", charges]] as [string, number][]) : []),
    ...(inter
      ? ([["IGST", Number(doc.igstPaise)]] as [string, number][])
      : ([
          ["CGST", Number(doc.cgstPaise)],
          ["SGST", Number(doc.sgstPaise)],
        ] as [string, number][])),
    ...(Number(doc.roundOffPaise) ? ([["Round off", Number(doc.roundOffPaise)]] as [string, number][]) : []),
  ];
  return (
    <div className="mt-3 flex items-start justify-between gap-4">
      <div className="max-w-[60%] text-[11.5px]">
        <div className="font-semibold">Amount in words</div>
        <div>{amountInWords(Number(doc.totalPaise))}</div>
      </div>
      <table style={{ width: "45%" }}>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td>{k}</td>
              <td className="num">{formatINR(v)}</td>
            </tr>
          ))}
          <tr>
            <td className="font-bold">Total</td>
            <td className="num text-[14px] font-bold">{formatINR(doc.totalPaise)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** HSN-wise tax summary (required on GST invoices). */
export function HsnSummary({ lines, inter }: { lines: any[]; inter: boolean }) {
  const map = new Map<string, { hsn: string; rate: number; taxable: number; tax: number }>();
  for (const l of lines) {
    const k = `${l.hsn ?? l.product?.hsn}|${l.gstRate}`;
    const cur = map.get(k) ?? { hsn: l.hsn ?? l.product?.hsn, rate: l.gstRate, taxable: 0, tax: 0 };
    cur.taxable += Number(l.taxablePaise);
    cur.tax += Number(l.taxPaise ?? Number(l.cgstPaise ?? 0) + Number(l.sgstPaise ?? 0) + Number(l.igstPaise ?? 0));
    map.set(k, cur);
  }
  return (
    <table className="mt-3 text-[11px]">
      <thead>
        <tr>
          <th>HSN</th>
          <th className="num">Taxable</th>
          {inter ? <th className="num">IGST</th> : <><th className="num">CGST</th><th className="num">SGST</th></>}
          <th className="num">Total tax</th>
        </tr>
      </thead>
      <tbody>
        {[...map.values()].map((r) => (
          <tr key={`${r.hsn}${r.rate}`}>
            <td>{r.hsn}</td>
            <td className="num">{formatINR(r.taxable)}</td>
            {inter ? (
              <td className="num">
                {r.rate}% · {formatINR(r.tax)}
              </td>
            ) : (
              <>
                <td className="num">
                  {r.rate / 2}% · {formatINR(Math.round(r.tax / 2))}
                </td>
                <td className="num">
                  {r.rate / 2}% · {formatINR(r.tax - Math.round(r.tax / 2))}
                </td>
              </>
            )}
            <td className="num">{formatINR(r.tax)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Signatures({ company }: { company?: string }) {
  return (
    <div className="mt-10 flex justify-between text-[11px]">
      <div>Customer signature</div>
      <div className="text-right">
        For {company ?? "Kailash Ceramics"}
        <div className="mt-8">Authorised signatory</div>
      </div>
    </div>
  );
}
