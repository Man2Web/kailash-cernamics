"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { computeDocTotals, formatINR, purchaseOrderSchema, toDateInput } from "@gc/shared";
import { PageHeader, Section } from "@/components/common/page-header";
import { FieldShell, FormGrid, NativeSelect } from "@/components/common/form-fields";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ProductPicker, QtyInput, SupplierPicker, type ProductLite } from "@/components/inventory/pickers";
import { LinesTable } from "@/components/inventory/doc-actions";
import { AddLineButton, RemoveLineButton, useLines, validate } from "@/components/inventory/line-editor";
import { RateInput, TotalsBox } from "@/components/purchase/rate";
import { useFormKeys, useDraft } from "@/hooks/use-form-keys";
import { api, ApiError, newIdempotencyKey } from "@/lib/api";

interface Line {
  productId: string | null;
  product: ProductLite | null;
  qtyPcs: number;
  ratePaise: number;
  gstRate: number;
}

export default function NewPurchaseOrderPage() {
  const router = useRouter();
  const [supplierId, setSupplier] = useState<string | null>(null);
  const [date, setDate] = useState(toDateInput());
  const [expectedDate, setExpected] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [key] = useState(newIdempotencyKey);
  const L = useLines<Line>(() => ({ productId: null, product: null, qtyPcs: 0, ratePaise: 0, gstRate: 18 }));
  const draft = useDraft("purchase-order-new", { supplierId, notes, lines: L.lines.length });

  const totals = useMemo(() => computeDocTotals(L.lines.map((l) => ({ qtyPcs: l.qtyPcs, ratePaise: l.ratePaise, gstRate: l.gstRate })), false), [L.lines]);

  const save = async () => {
    const body = validate(purchaseOrderSchema, {
      supplierId,
      date,
      expectedDate: expectedDate || null,
      notes,
      lines: L.plain().map(({ product: _p, ...l }) => l),
    });
    if (!body) return;
    setBusy(true);
    try {
      const po = await api<{ id: string; number: string }>("/purchase-orders", { method: "POST", body, idempotencyKey: key });
      draft.clear();
      toast.success(`${po.number} saved`);
      router.push(`/purchase/orders/${po.id}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };
  const ref = useFormKeys<HTMLFormElement>(save);

  return (
    <>
      <PageHeader title="New purchase order" back={{ href: "/purchase/orders", label: "Purchase orders" }} />
      <form ref={ref} onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-4">
        <Section>
          <FormGrid cols={3}>
            <FieldShell label="Supplier" required>
              <SupplierPicker value={supplierId} onChange={(id) => setSupplier(id)} />
            </FieldShell>
            <FieldShell label="PO date">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </FieldShell>
            <FieldShell label="Expected delivery">
              <Input type="date" value={expectedDate} onChange={(e) => setExpected(e.target.value)} />
            </FieldShell>
          </FormGrid>
        </Section>
        <Section title="Items" actions={<AddLineButton onClick={L.add} />}>
          <LinesTable head={["Product", "Quantity", "Rate", "GST %", "Amount", ""]}>
            {L.lines.map((l, i) => (
              <tr key={l._key} className="border-b border-border/60 align-top">
                <td className="w-80 p-2">
                  <ProductPicker value={l.productId} onChange={(id, p) => L.update(l._key, { productId: id, product: p, gstRate: p?.gstRate ?? 18 })} />
                </td>
                <td className="p-2"><QtyInput product={l.product} value={l.qtyPcs} onChange={(n) => L.update(l._key, { qtyPcs: n })} /></td>
                <td className="p-2"><RateInput product={l.product} ratePaise={l.ratePaise} onChange={(r) => L.update(l._key, { ratePaise: r })} /></td>
                <td className="w-24 p-2">
                  <NativeSelect value={l.gstRate} onChange={(e) => L.update(l._key, { gstRate: Number(e.target.value) })} aria-label="GST rate">
                    {[0, 5, 12, 18, 28].map((g) => <option key={g} value={g}>{g}%</option>)}
                  </NativeSelect>
                </td>
                <td className="p-2 text-right font-medium tabular">{formatINR(totals.lines[i]?.taxablePaise ?? 0)}</td>
                <td className="p-2"><RemoveLineButton onClick={() => L.remove(l._key)} /></td>
              </tr>
            ))}
          </LinesTable>
          <div className="mt-4">
            <TotalsBox
              rows={[
                { label: "Taxable value", value: formatINR(totals.taxablePaise) },
                { label: "GST (estimate)", value: formatINR(totals.cgstPaise + totals.sgstPaise + totals.igstPaise) },
                { label: "Total", value: formatINR(totals.totalPaise), strong: true },
              ]}
            />
          </div>
        </Section>
        <Section>
          <FieldShell label="Notes for supplier">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </FieldShell>
        </Section>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save PO"}</Button>
        </div>
      </form>
    </>
  );
}
