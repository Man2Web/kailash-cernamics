"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatDate, formatDateTime, formatINR, labelOf, toDateInput } from "@gc/shared";
import { PageHeader, Section } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorState, LoadingPage } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { DocForm } from "@/components/sales/doc-form";
import { DocSummary } from "@/components/sales/doc-view";
import { ORDER_STATUS_LABEL } from "@/components/sales/doc-list";
import { SplitDialog, toEditLines, useAvailability } from "@/components/sales/sales-kit";
import { api, useApi } from "@/lib/api";
import { useSession } from "@/lib/session";

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();
  const { can } = useSession();
  const q = useApi<any>(`/sales-orders/${id}`);
  const [split, setSplit] = useState<any | null>(null);
  const av = useAvailability(split?.productId);

  if (q.isLoading) return <LoadingPage />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const o = q.data;

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

  const header = (
    <PageHeader
      back={{ href: "/sales/orders", label: "Sales orders" }}
      title={
        <span className="flex items-center gap-2">
          {o.number} <StatusBadge status={o.status} label={ORDER_STATUS_LABEL[o.status]} />
        </span>
      }
      description={`${o.party?.name} · ${formatDate(o.date)}${o.deliveryDate ? ` · deliver by ${formatDate(o.deliveryDate)}` : ""} · ${formatINR(o.totalPaise)}`}
      actions={
        <>
          {o.status === "DRAFT" && can("order.write") && (
            <Button size="sm" onClick={() => run(() => api(`/sales-orders/${id}/confirm`, { method: "POST", body: {} }), "Order confirmed")}>
              Confirm & reserve
            </Button>
          )}
          {["APPROVED", "PARTIAL"].includes(o.status) && can("invoice.write") && (
            <Button size="sm" onClick={() => run(() => api(`/sales-orders/${id}/invoice`, { method: "POST", body: {} }), "Draft invoice created", (r) => `/sales/invoices/${r.id}`)}>
              Make invoice
            </Button>
          )}
          {!["COMPLETED", "CANCELLED"].includes(o.status) && can("order.write") && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const reason = prompt("Reason for cancelling this order?");
                if (reason) run(() => api(`/sales-orders/${id}/cancel`, { method: "POST", body: { reason } }), "Order cancelled");
              }}
            >
              Cancel order
            </Button>
          )}
        </>
      }
    />
  );

  if (o.status === "DRAFT" && can("order.write")) {
    return (
      <>
        {header}
        <DocForm
          key={o.updatedAt}
          kind="order"
          docId={id}
          initial={{
            partyId: o.partyId,
            siteId: o.siteId,
            influencerId: o.influencerId,
            date: toDateInput(o.date),
            deliveryDate: o.deliveryDate ? toDateInput(o.deliveryDate) : "",
            notes: o.notes ?? "",
            transportPaise: Number(o.transportPaise),
            loadingPaise: Number(o.loadingPaise),
            lines: toEditLines(o.lines),
          }}
        />
      </>
    );
  }

  return (
    <>
      {header}
      {o.status === "PENDING_APPROVAL" && (
        <div className="mb-4 rounded-lg bg-ios-orange/10 px-3 py-2 text-[13px] text-ios-orange">On hold for approval: {o.holdReason}</div>
      )}
      <DocSummary
        doc={o}
        extra={
          <>
            {["APPROVED", "PENDING_APPROVAL"].includes(o.status) && can("order.write") && (
              <Section title="Reservations">
                <ul className="divide-y divide-border text-[13px]">
                  {o.lines.map((l: any) => (
                    <li key={l.id} className="flex items-center justify-between gap-2 py-2">
                      <span>
                        {l.product.name} — {l.batch ? `shade ${l.batch.shadeCode} (${l.batch.batchNo})` : "batch picked on confirm"}
                      </span>
                      {l.invoicedPcs === 0 && l.product.uomType === "PIECE_BOX_AREA" && (
                        <Button size="sm" variant="secondary" className="h-7" onClick={() => setSplit(l)}>
                          Split across batches
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </Section>
            )}
            {(o.approvals?.length > 0 || o.invoices?.length > 0) && (
              <Section title="Approvals & invoices">
                <ul className="divide-y divide-border text-[13px]">
                  {o.approvals.map((a: any) => (
                    <li key={a.id} className="flex items-center justify-between gap-2 py-2">
                      <span>
                        {labelOf(a.type)}: {a.reason}
                      </span>
                      <span className="flex items-center gap-2">
                        <StatusBadge status={a.status} />
                        <span className="text-[12px] text-muted-foreground">{a.decidedBy?.name ?? formatDateTime(a.createdAt)}</span>
                      </span>
                    </li>
                  ))}
                  {o.invoices.map((inv: any) => (
                    <li key={inv.id} className="flex items-center justify-between gap-2 py-2">
                      <Link className="text-tint hover:underline" href={`/sales/invoices/${inv.id}`}>
                        Invoice {inv.number ?? "(draft)"}
                      </Link>
                      <span className="flex items-center gap-2">
                        {formatINR(inv.totalPaise)} <StatusBadge status={inv.status} />
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </>
        }
      />
      <SplitDialog
        open={!!split}
        onClose={() => setSplit(null)}
        product={split?.product}
        qtyPcs={split?.qtyPcs ?? 0}
        batches={(av.data ?? []).map((b) => (split && b.batchId === split.batchId && b.godownId === split.godownId && o.status === "APPROVED" ? { ...b, available: b.available + split.qtyPcs } : b))}
        onApply={(parts) => {
          const line = split;
          setSplit(null);
          run(() => api(`/sales-orders/${id}/lines/${line.id}/split`, { method: "POST", body: { parts } }), "Line split across batches");
        }}
      />
    </>
  );
}
