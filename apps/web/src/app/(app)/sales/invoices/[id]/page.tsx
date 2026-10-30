"use client";

import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, MessageCircle, Printer, Truck, Undo2 } from "lucide-react";
import { formatDate, formatINR, salesWhatsAppLink, toDateInput } from "@gc/shared";
import { PageHeader, Section } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorState, LoadingPage } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { DocForm } from "@/components/sales/doc-form";
import { DocSummary } from "@/components/sales/doc-view";
import { toEditLines } from "@/components/sales/sales-kit";
import { EInvoicePanel } from "@/components/sales/einvoice-panel";
import { api, useApi } from "@/lib/api";
import { useSession } from "@/lib/session";

export default function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();
  const { can } = useSession();
  const q = useApi<any>(`/invoices/${id}`);

  if (q.isLoading) return <LoadingPage />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const inv = q.data;

  const run = async (fn: () => Promise<any>, ok: string, go?: (r: any) => string) => {
    try {
      const r = await fn();
      toast.success(ok);
      qc.invalidateQueries();
      if (go) router.push(go(r));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };
  const balance = Number(inv.totalPaise) - Number(inv.paidPaise);

  const header = (
    <PageHeader
      back={{ href: "/sales/invoices", label: "Invoices" }}
      title={
        <span className="flex flex-wrap items-center gap-2">
          {inv.number ?? "Draft invoice"} <StatusBadge status={inv.status} />
          {inv.status !== "DRAFT" && <StatusBadge status={inv.syncStatus} />}
        </span>
      }
      description={`${inv.party?.name} · ${formatDate(inv.date)} · ${formatINR(inv.totalPaise)}${inv.status === "POSTED" ? ` · balance ${formatINR(balance)}${inv.dueDate ? ` due ${formatDate(inv.dueDate)}` : ""}` : ""}${inv.salesOrder ? ` · order ${inv.salesOrder.number}` : ""}`}
      actions={
        <>
          {inv.status === "DRAFT" && can("invoice.write") && (
            <Button size="sm" onClick={() => run(() => api(`/invoices/${id}/post`, { method: "POST", body: {} }), "Invoice posted")}>
              Post invoice
            </Button>
          )}
          {inv.status !== "DRAFT" && (
            <Button asChild size="sm" variant="secondary">
              <Link href={`/print/invoice/${id}`} target="_blank">
                <Printer className="size-4" /> Print / PDF
              </Link>
            </Button>
          )}
          {inv.status === "POSTED" && (
            <Button asChild size="sm" variant="secondary">
              <a
                href={salesWhatsAppLink(inv.party?.phone, `Dear ${inv.party?.name}, your invoice ${inv.number} for ${formatINR(inv.totalPaise)} from ${inv.branch?.company?.name ?? "Kailash Ceramics"}: ${typeof window !== "undefined" ? window.location.origin : ""}/print/invoice/${id}`)}
                target="_blank"
                rel="noopener"
              >
                <MessageCircle className="size-4" /> WhatsApp
              </a>
            </Button>
          )}
          {inv.status === "POSTED" && can("dispatch.write") && (
            <Button size="sm" variant="secondary" onClick={() => run(() => api(`/challans`, { method: "POST", body: { invoiceId: id } }), "Challan created", (r) => `/sales/challans/${r.id}`)}>
              <Truck className="size-4" /> Delivery challan
            </Button>
          )}
          {inv.status === "POSTED" && can("return.write") && (
            <Button asChild size="sm" variant="secondary">
              <Link href={`/sales/returns/new?invoiceId=${id}`}>
                <Undo2 className="size-4" /> Return
              </Link>
            </Button>
          )}
          {inv.status !== "CANCELLED" && can("invoice.cancel") && (
            <Button
              size="sm"
              variant="secondary"
              className="text-destructive"
              onClick={() => {
                const reason = prompt(inv.status === "POSTED" ? "Reason for cancelling? Stock goes back and the number is kept. Re-issue a new invoice after." : "Reason for discarding this draft?");
                if (reason && reason.trim().length >= 3) run(() => api(`/invoices/${id}/cancel`, { method: "POST", body: { reason } }), "Invoice cancelled");
              }}
            >
              Cancel
            </Button>
          )}
        </>
      }
    />
  );

  if (inv.status === "DRAFT" && can("invoice.write")) {
    return (
      <>
        {header}
        <DocForm
          key={inv.updatedAt}
          kind="invoice"
          docId={id}
          initial={{
            partyId: inv.partyId,
            siteId: inv.siteId,
            influencerId: inv.influencerId,
            date: toDateInput(inv.date),
            notes: inv.notes ?? "",
            transportPaise: Number(inv.transportPaise),
            loadingPaise: Number(inv.loadingPaise),
            lines: toEditLines(inv.lines).map((l, i) => ({ ...l, priceBasis: "PER_UNIT", enteredRatePaise: Number(inv.lines[i].ratePaise) })),
          }}
        />
      </>
    );
  }

  return (
    <>
      {header}
      {inv.status === "CANCELLED" && <div className="mb-4 rounded-lg bg-fill px-3 py-2 text-[13px]">Cancelled: {inv.cancelReason}</div>}
      {inv.warnings?.length > 0 && (
        <div className="mb-4 space-y-1 rounded-lg bg-ios-orange/10 px-3 py-2 text-[13px] text-ios-orange">
          {inv.warnings.map((w: any) => (
            <div key={w.productId} className="flex gap-2">
              <AlertTriangle className="size-4 shrink-0" /> Shade mismatch — {w.message}
            </div>
          ))}
        </div>
      )}
      <DocSummary
        doc={inv}
        extra={
          <>
          <EInvoicePanel inv={inv} />
          {(inv.challans?.length > 0 || inv.returns?.length > 0 || inv.allocations?.length > 0) && (
            <Section title="Delivery, returns & payments">
              <ul className="divide-y divide-border text-[13px]">
                {inv.challans.map((c: any) => (
                  <li key={c.id} className="flex justify-between py-2">
                    <Link className="text-tint hover:underline" href={`/sales/challans/${c.id}`}>
                      Challan {c.number}
                    </Link>
                    <StatusBadge status={c.status} label={c.status === "COMPLETED" ? "Delivered" : undefined} />
                  </li>
                ))}
                {inv.returns.map((r: any) => (
                  <li key={r.id} className="flex justify-between py-2">
                    <Link className="text-tint hover:underline" href={`/sales/returns/${r.id}`}>
                      Return {r.number}
                    </Link>
                    <span>{formatINR(r.totalPaise)}</span>
                  </li>
                ))}
                {inv.allocations.map((a: any) => (
                  <li key={a.id} className="flex justify-between py-2">
                    <span>
                      Receipt {a.receipt.number} ({a.receipt.mode})
                    </span>
                    <span>{formatINR(a.amountPaise)}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          </>
        }
      />
    </>
  );
}
