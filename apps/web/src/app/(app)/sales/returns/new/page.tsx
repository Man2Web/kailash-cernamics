"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { formatDate, formatINR } from "@gc/shared";
import { PageHeader, Section } from "@/components/common/page-header";
import { FieldShell, NativeSelect } from "@/components/common/form-fields";
import { EntitySelect } from "@/components/common/entity-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fmtQty } from "@/components/sales/sales-kit";
import { api, useApi } from "@/lib/api";

function ReturnForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [invoiceId, setInvoiceId] = useState<string | null>(params.get("invoiceId"));
  const inv = useApi<any>(invoiceId ? `/invoices/${invoiceId}` : null);
  const returned = useApi<Record<string, number>>(invoiceId ? `/sales-returns/returnable/${invoiceId}` : null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [to, setTo] = useState<Record<string, "SALEABLE" | "DAMAGED">>({});
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setQty({});
    setTo({});
  }, [invoiceId]);

  const save = async () => {
    const lines = Object.entries(qty)
      .filter(([, q]) => q > 0)
      .map(([invoiceLineId, qtyPcs]) => ({ invoiceLineId, qtyPcs, toStockType: to[invoiceLineId] ?? "SALEABLE" }));
    if (!invoiceId || !lines.length) return toast.error("Enter the quantity returned on at least one line");
    setSaving(true);
    try {
      const r = await api<{ id: string; number: string; creditNote: { number: string } }>("/sales-returns", { method: "POST", body: { invoiceId, reason: reason || null, lines } });
      toast.success(`Return ${r.number} and credit note ${r.creditNote.number} created`);
      router.push(`/sales/returns/${r.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Section className="max-w-xl">
        <FieldShell label="Invoice" required>
          <EntitySelect<any>
            endpoint="/invoices"
            params={{ status: "POSTED" }}
            value={invoiceId}
            onChange={(id) => setInvoiceId(id)}
            getLabel={(i) => `${i.number} · ${i.party?.name ?? ""}`}
            getDescription={(i) => `${formatDate(i.date)} · ${formatINR(i.totalPaise)}`}
          />
        </FieldShell>
      </Section>
      {inv.data && (
        <Section title={`Lines on ${inv.data.number}`}>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
                <th className="py-2">Product</th>
                <th className="py-2 text-right">Billed</th>
                <th className="py-2 text-right">Can return</th>
                <th className="py-2">Return pcs</th>
                <th className="py-2">Back to</th>
              </tr>
            </thead>
            <tbody>
              {inv.data.lines.map((l: any) => {
                const left = l.qtyPcs - (returned.data?.[l.id] ?? 0);
                return (
                  <tr key={l.id} className="border-b border-border/60">
                    <td className="py-2">
                      <div className="font-medium">{l.product.name}</div>
                      <div className="text-[12px] text-muted-foreground">
                        {l.product.sku}
                        {l.batch && l.batch.batchNo !== "DEFAULT" ? ` · shade ${l.batch.shadeCode}` : ""}
                      </div>
                    </td>
                    <td className="py-2 text-right tabular">{fmtQty(l.qtyPcs, l.product)}</td>
                    <td className="py-2 text-right tabular">{left} pcs</td>
                    <td className="py-2">
                      <Input
                        className="h-8 w-20 tabular"
                        inputMode="numeric"
                        disabled={left <= 0}
                        value={qty[l.id] || ""}
                        placeholder="0"
                        onChange={(e) => setQty((s) => ({ ...s, [l.id]: Math.min(left, Number(e.target.value.replace(/\D/g, "") || 0)) }))}
                      />
                    </td>
                    <td className="py-2">
                      <NativeSelect className="h-8 w-32" value={to[l.id] ?? "SALEABLE"} onChange={(e) => setTo((s) => ({ ...s, [l.id]: e.target.value as "SALEABLE" | "DAMAGED" }))}>
                        <option value="SALEABLE">Saleable</option>
                        <option value="DAMAGED">Damaged</option>
                      </NativeSelect>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <FieldShell label="Reason" className="mt-4">
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. broken in transit, excess quantity" />
          </FieldShell>
          <Button className="mt-4" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save return & credit note"}
          </Button>
        </Section>
      )}
    </div>
  );
}

export default function NewReturnPage() {
  return (
    <>
      <PageHeader title="New sales return" back={{ href: "/sales/returns", label: "Returns" }} />
      <Suspense>
        <ReturnForm />
      </Suspense>
    </>
  );
}
