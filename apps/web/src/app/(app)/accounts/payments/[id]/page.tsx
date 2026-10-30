"use client";

import { useParams } from "next/navigation";
import { toast } from "sonner";
import { formatDate, formatINR, labelOf } from "@gc/shared";
import { InfoGrid, PageHeader, Section } from "@/components/common/page-header";
import { ErrorState, LoadingPage } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { api, useApi, useApiMutation } from "@/lib/api";
import { useSession } from "@/lib/session";

interface Payment {
  id: string;
  number: string;
  date: string;
  mode: string;
  amountPaise: number;
  reference: string | null;
  status: string;
  syncStatus: string;
  notes: string | null;
  party: { id: string; name: string; phone: string | null };
  allocations: { id: string; amountPaise: number; purchaseInvoice: { id: string; number: string; supplierInvoiceNo: string; date: string; totalPaise: number } }[];
}

export default function PaymentPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const q = useApi<Payment>(`/payments/${id}`);
  const cancel = useApiMutation((reason: string) => api(`/payments/${id}/cancel`, { method: "POST", body: { reason } }), ["/payments", "/outstanding"]);
  if (q.isLoading) return <LoadingPage />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const p = q.data;
  const allocated = p.allocations.reduce((a, x) => a + x.amountPaise, 0);
  return (
    <>
      <PageHeader
        title={`Payment ${p.number}`}
        back={{ href: "/accounts/payments", label: "Payments" }}
        description={<span className="flex gap-1.5"><StatusBadge status={p.status} /><StatusBadge status={p.syncStatus} /></span>}
        actions={
          can("payment.write") && p.status === "POSTED" && (
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { const r = prompt("Why cancel this payment?"); if (r) cancel.mutate(r, { onSuccess: () => { toast.success("Payment cancelled"); q.refetch(); }, onError: (e) => toast.error(e.message) }); }}>
              Cancel payment
            </Button>
          )
        }
      />
      <div className="space-y-4">
        <Section>
          <InfoGrid items={[
            { label: "Supplier", value: p.party.name },
            { label: "Date", value: formatDate(p.date) },
            { label: "Mode", value: labelOf(p.mode) },
            { label: "Amount", value: formatINR(p.amountPaise) },
            { label: "Reference", value: p.reference },
            { label: "Advance (on account)", value: formatINR(p.amountPaise - allocated) },
          ]} />
          {p.notes && <p className="mt-3 text-[13px] whitespace-pre-line">{p.notes}</p>}
        </Section>
        <Section title="Allocated to bills">
          {p.allocations.length ? (
            <ul className="divide-y divide-border text-[13px]">
              {p.allocations.map((a) => (
                <li key={a.id} className="flex justify-between py-2">
                  <span>{a.purchaseInvoice.supplierInvoiceNo} · {formatDate(a.purchaseInvoice.date)}</span>
                  <span className="font-medium tabular">{formatINR(a.amountPaise)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-[13px] text-muted-foreground">Not allocated — kept as advance.</p>}
        </Section>
      </div>
    </>
  );
}
