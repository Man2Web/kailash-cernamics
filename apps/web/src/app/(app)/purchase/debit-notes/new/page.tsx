"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { computeLine, formatINR, purchaseDebitNoteSchema, toDateInput } from "@gc/shared";
import { PageHeader, Section } from "@/components/common/page-header";
import { FieldShell, FormGrid, NativeSelect } from "@/components/common/form-fields";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BatchSelect, GodownSelect, ProductPicker, QtyInput, SupplierPicker, type ProductLite } from "@/components/inventory/pickers";
import { LinesTable } from "@/components/inventory/doc-actions";
import { AddLineButton, RemoveLineButton, useLines, validate } from "@/components/inventory/line-editor";
import { RateInput } from "@/components/purchase/rate";
import { useFormKeys } from "@/hooks/use-form-keys";
import { api, ApiError, newIdempotencyKey } from "@/lib/api";

interface Line {
  productId: string | null;
  product: ProductLite | null;
  batchId: string | null;
  fromStockType: "SALEABLE" | "DAMAGED";
  qtyPcs: number;
  ratePaise: number;
  gstRate: number;
}

export default function NewDebitNotePage() {
  const router = useRouter();
  const [supplierId, setSupplier] = useState<string | null>(null);
  const [godownId, setGodown] = useState("");
  const [returnGoods, setReturnGoods] = useState(true);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(toDateInput());
  const [busy, setBusy] = useState(false);
  const [key] = useState(newIdempotencyKey);
  const L = useLines<Line>(() => ({ productId: null, product: null, batchId: null, fromStockType: "DAMAGED", qtyPcs: 0, ratePaise: 0, gstRate: 18 }));
  const total = L.lines.reduce((a, l) => a + computeLine({ qtyPcs: l.qtyPcs, ratePaise: l.ratePaise, gstRate: l.gstRate }, false).amountPaise, 0);

  const save = async () => {
    const body = validate(purchaseDebitNoteSchema, {
      supplierId,
      reason,
      date,
      lines: L.plain().map(({ product: _p, ...l }) => ({ ...l, godownId: returnGoods ? godownId || null : null, batchId: returnGoods ? l.batchId : null })),
    });
    if (!body) return;
    if (returnGoods && (!godownId || L.lines.some((l) => !l.batchId))) {
      toast.error("Pick the godown and the shade / batch being returned");
      return;
    }
    setBusy(true);
    try {
      const dn = await api<{ number: string }>("/debit-notes", { method: "POST", body, idempotencyKey: key });
      toast.success(`${dn.number} posted`);
      router.push("/purchase/debit-notes");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };
  const ref = useFormKeys<HTMLFormElement>(save);

  return (
    <>
      <PageHeader title="New debit note" back={{ href: "/purchase/debit-notes", label: "Debit notes" }} />
      <form ref={ref} onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-4">
        <Section>
          <FormGrid cols={3}>
            <FieldShell label="Supplier" required><SupplierPicker value={supplierId} onChange={(id) => setSupplier(id)} /></FieldShell>
            <FieldShell label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></FieldShell>
            <FieldShell label="Reason" required><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Broken on receipt" /></FieldShell>
            <label className="flex items-center gap-2 text-[13.5px]">
              <input type="checkbox" checked={returnGoods} onChange={(e) => setReturnGoods(e.target.checked)} /> Goods are going back to the supplier (stock out)
            </label>
            {returnGoods && <FieldShell label="From godown" required><GodownSelect value={godownId} onChange={setGodown} /></FieldShell>}
          </FormGrid>
        </Section>
        <Section title="Lines" actions={<AddLineButton onClick={L.add} />}>
          <LinesTable head={["Product", ...(returnGoods ? ["Shade / batch", "From stock"] : []), "Quantity", "Rate", "GST %", ""]}>
            {L.lines.map((l) => (
              <tr key={l._key} className="border-b border-border/60 align-top">
                <td className="w-72 p-2"><ProductPicker value={l.productId} onChange={(id, p) => L.update(l._key, { productId: id, product: p, batchId: null, gstRate: p?.gstRate ?? 18 })} /></td>
                {returnGoods && (
                  <>
                    <td className="w-60 p-2"><BatchSelect productId={l.productId} godownId={godownId || null} product={l.product} value={l.batchId} onChange={(id) => L.update(l._key, { batchId: id })} /></td>
                    <td className="w-28 p-2">
                      <NativeSelect value={l.fromStockType} onChange={(e) => L.update(l._key, { fromStockType: e.target.value as Line["fromStockType"] })} aria-label="From stock type">
                        <option value="DAMAGED">Damaged</option>
                        <option value="SALEABLE">Saleable</option>
                      </NativeSelect>
                    </td>
                  </>
                )}
                <td className="p-2"><QtyInput product={l.product} value={l.qtyPcs} onChange={(n) => L.update(l._key, { qtyPcs: n })} /></td>
                <td className="p-2"><RateInput product={l.product} ratePaise={l.ratePaise} onChange={(r) => L.update(l._key, { ratePaise: r })} /></td>
                <td className="w-24 p-2">
                  <NativeSelect value={l.gstRate} onChange={(e) => L.update(l._key, { gstRate: Number(e.target.value) })} aria-label="GST rate">
                    {[0, 5, 12, 18, 28].map((g) => <option key={g} value={g}>{g}%</option>)}
                  </NativeSelect>
                </td>
                <td className="p-2"><RemoveLineButton onClick={() => L.remove(l._key)} /></td>
              </tr>
            ))}
          </LinesTable>
          <p className="mt-3 text-right text-[15px] font-semibold tabular">Total (incl. GST) {formatINR(total)}</p>
        </Section>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? "Posting…" : "Post debit note"}</Button>
        </div>
      </form>
    </>
  );
}
