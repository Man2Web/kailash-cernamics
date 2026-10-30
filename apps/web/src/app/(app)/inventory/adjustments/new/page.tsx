"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { inventoryAdjustmentSchema, toDateInput } from "@gc/shared";
import { PageHeader, Section } from "@/components/common/page-header";
import { FieldShell, FormGrid, NativeSelect } from "@/components/common/form-fields";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BatchSelect, GodownSelect, ProductPicker, QtyInput, RackSelect, type ProductLite } from "@/components/inventory/pickers";
import { LinesTable } from "@/components/inventory/doc-actions";
import { AddLineButton, RemoveLineButton, useLines, validate } from "@/components/inventory/line-editor";
import { useFormKeys } from "@/hooks/use-form-keys";
import { api, ApiError, newIdempotencyKey } from "@/lib/api";

interface Line {
  productId: string | null;
  product: ProductLite | null;
  batchId: string | null;
  rackId: string | null;
  stockType: "SALEABLE" | "DISPLAY" | "DAMAGED";
  qtyPcs: number;
}

export default function NewAdjustmentPage() {
  const router = useRouter();
  const [godownId, setGodown] = useState("");
  const [date, setDate] = useState(toDateInput());
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [key] = useState(newIdempotencyKey);
  const L = useLines<Line>(() => ({ productId: null, product: null, batchId: null, rackId: null, stockType: "SALEABLE", qtyPcs: 0 }));

  const save = async (submit: boolean) => {
    const body = validate(inventoryAdjustmentSchema, { date, godownId, reason, lines: L.plain().map(({ product: _p, ...l }) => l) });
    if (!body) return;
    setBusy(true);
    try {
      const doc = await api<{ id: string; number: string }>("/stock/adjustments", { method: "POST", body, idempotencyKey: key });
      if (submit) await api(`/stock/adjustments/${doc.id}/submit`, { method: "POST", body: {} });
      toast.success(submit ? `${doc.number} sent for approval` : `${doc.number} saved as draft`);
      router.push(`/inventory/adjustments/${doc.id}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };
  const ref = useFormKeys<HTMLFormElement>(() => save(false));

  return (
    <>
      <PageHeader title="New stock adjustment" back={{ href: "/inventory/adjustments", label: "Adjustments" }} description="Use − for missing pieces and + for extra pieces found." />
      <form ref={ref} onSubmit={(e) => { e.preventDefault(); save(true); }} className="space-y-4">
        <Section>
          <FormGrid cols={3}>
            <FieldShell label="Godown" required>
              <GodownSelect value={godownId} onChange={setGodown} />
            </FieldShell>
            <FieldShell label="Date">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </FieldShell>
            <FieldShell label="Reason" required>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Physical count on 24 Oct" />
            </FieldShell>
          </FormGrid>
        </Section>
        <Section title="Lines" actions={<AddLineButton onClick={L.add} />}>
          <LinesTable head={["Product", "Shade / batch", "Rack", "Stock type", "Change (±)", ""]}>
            {L.lines.map((l) => (
              <tr key={l._key} className="border-b border-border/60 align-top">
                <td className="w-72 p-2"><ProductPicker value={l.productId} onChange={(id, p) => L.update(l._key, { productId: id, product: p, batchId: null })} /></td>
                <td className="w-64 p-2"><BatchSelect productId={l.productId} godownId={godownId || null} product={l.product} value={l.batchId} onChange={(id) => L.update(l._key, { batchId: id })} /></td>
                <td className="w-32 p-2"><RackSelect godownId={godownId} value={l.rackId} onChange={(id) => L.update(l._key, { rackId: id })} emptyLabel="No rack" /></td>
                <td className="w-32 p-2">
                  <NativeSelect value={l.stockType} onChange={(e) => L.update(l._key, { stockType: e.target.value as Line["stockType"] })} aria-label="Stock type">
                    <option value="SALEABLE">Saleable</option>
                    <option value="DISPLAY">Display</option>
                    <option value="DAMAGED">Damaged</option>
                  </NativeSelect>
                </td>
                <td className="p-2"><QtyInput product={l.product} value={l.qtyPcs} onChange={(n) => L.update(l._key, { qtyPcs: n })} allowNegative /></td>
                <td className="p-2"><RemoveLineButton onClick={() => L.remove(l._key)} /></td>
              </tr>
            ))}
          </LinesTable>
        </Section>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" disabled={busy} onClick={() => save(false)}>Save draft</Button>
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Submit for approval"}</Button>
        </div>
      </form>
    </>
  );
}
