"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Printer } from "lucide-react";
import { formatDate, formatINR, toDateInput } from "@gc/shared";
import { PageHeader, Section } from "@/components/common/page-header";
import { ErrorState, LoadingPage } from "@/components/common/states";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useApi } from "@/lib/api";
import { exportToExcel } from "@/lib/export";

interface Statement {
  party: { id: string; name: string; phone: string | null; gstin: string | null; billingAddress: string | null; type: string };
  opening: number;
  closing: number;
  totals: { debit: number; credit: number };
  rows: { id: string; date: string; type: string; number: string; debit: number; credit: number; balance: number; link: string }[];
}

const bal = (v: number) => `${formatINR(Math.abs(v))} ${v >= 0 ? "Dr" : "Cr"}`;

export default function StatementPage() {
  const { partyId } = useParams<{ partyId: string }>();
  const fyStart = (() => {
    const now = new Date();
    const y = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
    return `${y}-04-01`;
  })();
  const [from, setFrom] = useState(fyStart);
  const [to, setTo] = useState(toDateInput());
  const q = useApi<Statement>(`/statements/${partyId}`, { from: `${from}T00:00:00+05:30`, to: `${to}T23:59:59+05:30` });

  if (q.isLoading) return <LoadingPage />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const s = q.data;
  const doExport = () =>
    exportToExcel(
      `statement-${s.party.name}`,
      [{ header: "Date", key: "date" }, { header: "Type", key: "type" }, { header: "Number", key: "number" }, { header: "Debit", key: "debit" }, { header: "Credit", key: "credit" }, { header: "Balance", key: "balance" }],
      [{ date: "", type: "Opening balance", number: "", debit: "", credit: "", balance: s.opening / 100 }, ...s.rows.map((r) => ({ date: formatDate(r.date), type: r.type, number: r.number, debit: r.debit / 100 || "", credit: r.credit / 100 || "", balance: r.balance / 100 }))],
    );

  return (
    <>
      <PageHeader
        title="Party statement"
        back={{ href: "/accounts/outstanding", label: "Outstanding" }}
        className="print:hidden"
        actions={
          <>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-36" aria-label="From" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-36" aria-label="To" />
            <Button size="sm" variant="secondary" onClick={doExport}>Excel</Button>
            <Button size="sm" onClick={() => window.print()}><Printer className="size-4" /> Print / PDF</Button>
            {s.party.type !== "SUPPLIER" && <Button asChild size="sm" variant="secondary"><Link href={`/accounts/receipts/new?partyId=${s.party.id}`}>Record receipt</Link></Button>}
          </>
        }
      />
      <Section className="print:shadow-none">
        <div className="mb-4 flex flex-col justify-between gap-3 border-b border-border pb-4 md:flex-row">
          <div>
            <div className="text-[18px] font-bold">Kailash Ceramics</div>
            <div className="text-[12px] text-muted-foreground">Statement of account · {formatDate(`${from}T12:00:00+05:30`)} to {formatDate(`${to}T12:00:00+05:30`)}</div>
          </div>
          <div className="text-[13px] md:text-right">
            <div className="font-semibold">{s.party.name}</div>
            {s.party.billingAddress && <div className="text-muted-foreground">{s.party.billingAddress}</div>}
            {s.party.gstin && <div className="text-muted-foreground">GSTIN {s.party.gstin}</div>}
            {s.party.phone && <div className="text-muted-foreground">{s.party.phone}</div>}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
                <th className="py-2 pr-2 font-medium">Date</th>
                <th className="py-2 pr-2 font-medium">Particulars</th>
                <th className="py-2 pr-2 font-medium">Number</th>
                <th className="py-2 pr-2 text-right font-medium">Debit</th>
                <th className="py-2 pr-2 text-right font-medium">Credit</th>
                <th className="py-2 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/60 bg-fill/40">
                <td className="py-2" colSpan={5}>Opening balance</td>
                <td className="py-2 text-right font-medium tabular">{bal(s.opening)}</td>
              </tr>
              {s.rows.map((r) => (
                <tr key={`${r.type}-${r.id}`} className="border-b border-border/60">
                  <td className="py-2 pr-2 whitespace-nowrap">{formatDate(r.date)}</td>
                  <td className="py-2 pr-2">{r.type}</td>
                  <td className="py-2 pr-2"><Link href={r.link} className="hover:underline print:no-underline">{r.number}</Link></td>
                  <td className="py-2 pr-2 text-right tabular">{r.debit ? formatINR(r.debit) : ""}</td>
                  <td className="py-2 pr-2 text-right tabular">{r.credit ? formatINR(r.credit) : ""}</td>
                  <td className="py-2 text-right tabular">{bal(r.balance)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="py-2" colSpan={3}>Closing balance</td>
                <td className="py-2 pr-2 text-right tabular">{formatINR(s.totals.debit)}</td>
                <td className="py-2 pr-2 text-right tabular">{formatINR(s.totals.credit)}</td>
                <td className="py-2 text-right tabular">{bal(s.closing)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Section>
    </>
  );
}
