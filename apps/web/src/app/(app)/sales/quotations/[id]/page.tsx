"use client";

import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, FileOutput, MessageCircle, Printer, Send } from "lucide-react";
import { formatDate, formatINR } from "@gc/shared";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorState, LoadingPage } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { QuoteBuilder, quoteToValues } from "@/components/sales/quote-builder";
import { api, apiGet, useApi } from "@/lib/api";
import { useSession } from "@/lib/session";

export default function QuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();
  const { can } = useSession();
  const q = useApi<any>(`/quotations/${id}`);

  if (q.isLoading) return <LoadingPage />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const quote = q.data;
  const draft = quote.status === "DRAFT";
  const writable = can("quotation.write");

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

  const share = async () => {
    try {
      const s = await apiGet<{ whatsappUrl: string; text: string }>(`/quotations/${id}/share`);
      window.open(s.whatsappUrl, "_blank", "noopener");
      if (quote.status === "DRAFT") await api(`/quotations/${id}/status`, { method: "POST", body: { status: "SENT" } });
      qc.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const latest = Math.max(...(quote.revisions ?? []).map((r: any) => r.revisionNo));
  return (
    <>
      <PageHeader
        back={{ href: "/sales/quotations", label: "Quotations" }}
        title={
          <span className="flex items-center gap-2">
            {quote.number}
            {quote.revisionNo > 1 && <span className="text-[15px] font-medium text-muted-foreground">Rev {quote.revisionNo}</span>}
            <StatusBadge status={quote.status} />
          </span>
        }
        description={`${quote.party?.name ?? quote.customerName ?? ""} · ${formatDate(quote.date)} · valid till ${formatDate(quote.validUntil)} · ${formatINR(quote.totalPaise)}`}
        actions={
          <>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/print/quotation/${id}`} target="_blank">
                <Printer className="size-4" /> Print / PDF
              </Link>
            </Button>
            <Button variant="secondary" size="sm" onClick={share}>
              <MessageCircle className="size-4" /> WhatsApp
            </Button>
            {writable && draft && (
              <Button variant="secondary" size="sm" onClick={() => run(() => api(`/quotations/${id}/status`, { method: "POST", body: { status: "SENT" } }), "Marked as sent")}>
                <Send className="size-4" /> Mark sent
              </Button>
            )}
            {writable && quote.revisionNo === latest && !["CONVERTED", "EXPIRED"].includes(quote.status) && (
              <Button variant="secondary" size="sm" onClick={() => run(() => api(`/quotations/${id}/revise`, { method: "POST", body: {} }), "New revision created", (r) => `/sales/quotations/${r.id}`)}>
                <Copy className="size-4" /> Revise
              </Button>
            )}
            {can("order.write") && !["CONVERTED", "EXPIRED", "REJECTED"].includes(quote.status) && (
              <Button size="sm" onClick={() => run(() => api(`/quotations/${id}/convert`, { method: "POST", body: {} }), "Sales order created", (r) => `/sales/orders/${r.id}`)}>
                <FileOutput className="size-4" /> Convert to order
              </Button>
            )}
            {quote.salesOrderId && (
              <Button asChild size="sm" variant="secondary">
                <Link href={`/sales/orders/${quote.salesOrderId}`}>Open order</Link>
              </Button>
            )}
          </>
        }
      />
      {quote.revisions?.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-1 text-[13px]">
          <span className="text-muted-foreground">Revisions:</span>
          {quote.revisions.map((r: any) => (
            <Link key={r.id} href={`/sales/quotations/${r.id}`} className={r.id === id ? "rounded-md bg-fill-strong px-2 py-0.5 font-medium" : "rounded-md px-2 py-0.5 text-tint hover:bg-fill"}>
              Rev {r.revisionNo} · {formatINR(r.totalPaise)}
            </Link>
          ))}
        </div>
      )}
      <QuoteBuilder key={quote.updatedAt} initial={quoteToValues(quote)} quoteId={id} readOnly={!draft || !writable} />
    </>
  );
}
