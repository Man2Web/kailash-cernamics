"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { amountInWords, formatDate, formatDateTime, formatINR, labelOf } from "@gc/shared";
import { InfoGrid, PageHeader, Section } from "@/components/common/page-header";
import { ErrorState, LoadingPage } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { api, useApi, useApiMutation } from "@/lib/api";
import { useSession } from "@/lib/session";

interface Receipt {
  id: string;
  number: string;
  date: string;
  mode: string;
  amountPaise: number;
  unallocatedPaise: number;
  reference: string | null;
  chequeNo: string | null;
  chequeDate: string | null;
  bankName: string | null;
  chequeStatus: string | null;
  status: string;
  syncStatus: string;
  source: string;
  notes: string | null;
  createdAt: string;
  party: { id: string; name: string; phone: string | null; gstin: string | null };
  allocations: { id: string; amountPaise: number; invoice: { id: string; number: string; date: string; totalPaise: number; paidPaise: number } }[];
}

export default function ReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const q = useApi<Receipt>(`/receipts/${id}`);
  const act = useApiMutation((v: { path: string; body: unknown }) => api(v.path, { method: "POST", body: v.body }), ["/receipts", "/cheques", "/outstanding"]);
  const run = (path: string, body: unknown, ok: string) => act.mutate({ path, body }, { onSuccess: () => { toast.success(ok); q.refetch(); }, onError: (e) => toast.error(e.message) });

  if (q.isLoading) return <LoadingPage />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const r = q.data;
  const canWrite = can("receipt.write") && r.status === "POSTED";

  return (
    <>
      <PageHeader
        title={`Receipt ${r.number}`}
        back={{ href: "/accounts/receipts", label: "Receipts" }}
        description={<span className="flex flex-wrap items-center gap-1.5"><StatusBadge status={r.status} />{r.chequeStatus && <StatusBadge status={r.chequeStatus} label={`Cheque ${labelOf(r.chequeStatus).toLowerCase()}`} />}<StatusBadge status={r.syncStatus} /></span>}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => window.print()}>Print</Button>
            {canWrite && r.unallocatedPaise > 0 && <Button size="sm" variant="secondary" onClick={() => run(`/receipts/${r.id}/allocate`, {}, "Advance allocated")}>Allocate advance</Button>}
            {canWrite && r.mode === "CHEQUE" && r.chequeStatus === "PENDING" && <Button size="sm" variant="secondary" onClick={() => run(`/receipts/${r.id}/cheque-status`, { status: "DEPOSITED" }, "Marked deposited")}>Deposited</Button>}
            {canWrite && r.mode === "CHEQUE" && (r.chequeStatus === "PENDING" || r.chequeStatus === "DEPOSITED") && (
              <>
                <Button size="sm" onClick={() => run(`/receipts/${r.id}/cheque-status`, { status: "CLEARED" }, "Cheque cleared")}>Cleared</Button>
                <Button size="sm" variant="destructive" onClick={() => { const note = prompt("Bounce reason?"); if (note !== null) run(`/receipts/${r.id}/cheque-status`, { status: "BOUNCED", note }, "Cheque marked bounced; allocations reversed"); }}>Bounced</Button>
              </>
            )}
            {canWrite && (
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { const reason = prompt("Why cancel this receipt?"); if (reason) run(`/receipts/${r.id}/cancel`, { reason }, "Receipt cancelled"); }}>
                Cancel receipt
              </Button>
            )}
          </>
        }
      />
      <div className="space-y-4">
        <Section>
          <InfoGrid
            items={[
              { label: "Customer", value: <Link className="text-tint hover:underline" href={`/accounts/statement/${r.party.id}`}>{r.party.name}</Link> },
              { label: "Date", value: formatDate(r.date) },
              { label: "Mode", value: labelOf(r.mode) },
              { label: "Amount", value: formatINR(r.amountPaise) },
              { label: "Reference", value: r.reference },
              { label: "Cheque", value: r.chequeNo ? `${r.chequeNo}${r.chequeDate ? ` · ${formatDate(r.chequeDate)}` : ""}` : null },
              { label: "Bank", value: r.bankName },
              { label: "Advance (on account)", value: formatINR(r.unallocatedPaise) },
            ]}
          />
          <p className="mt-3 text-[13px] text-muted-foreground">{amountInWords(r.amountPaise)}</p>
          {r.notes && <p className="mt-2 text-[13px] whitespace-pre-line">{r.notes}</p>}
          <p className="mt-2 text-[12px] text-muted-foreground">Recorded {formatDateTime(r.createdAt)}{r.source === "TALLY" ? " · imported from Tally" : ""}</p>
        </Section>
        <Section title="Allocated to invoices">
          {r.allocations.length ? (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
                  <th className="py-2 font-medium">Invoice</th>
                  <th className="py-2 font-medium">Date</th>
                  <th className="py-2 text-right font-medium">Invoice total</th>
                  <th className="py-2 text-right font-medium">Allocated</th>
                </tr>
              </thead>
              <tbody>
                {r.allocations.map((a) => (
                  <tr key={a.id} className="border-b border-border/60">
                    <td className="py-2"><Link href={`/sales/invoices/${a.invoice.id}`} className="text-tint hover:underline">{a.invoice.number}</Link></td>
                    <td className="py-2">{formatDate(a.invoice.date)}</td>
                    <td className="py-2 text-right tabular">{formatINR(a.invoice.totalPaise)}</td>
                    <td className="py-2 text-right font-medium tabular">{formatINR(a.amountPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-[13px] text-muted-foreground">Not allocated — kept as advance.</p>
          )}
        </Section>
      </div>
    </>
  );
}
