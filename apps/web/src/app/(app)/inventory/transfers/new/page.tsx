"use client";

import { useState } from "react";
import { DestinationGodownSelect } from "@/components/inventory-ops/destination-godown";
import { useSession } from "@/lib/session";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { inventoryTransferSchema, toDateInput } from "@gc/shared";
import { PageHeader, Section } from "@/components/common/page-header";
import { FieldShell, FormGrid, NativeSelect } from "@/components/common/form-fields";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  fromRackId: string | null;
  toRackId: string | null;
  fromStockType: "SALEABLE" | "DISPLAY" | "DAMAGED";
  toStockType: "SALEABLE" | "DISPLAY" | "DAMAGED";
  qtyPcs: number;
}

const TYPES = [
  { value: "SALEABLE", label: "Saleable" },
  { value: "DISPLAY", label: "Display" },
  { value: "DAMAGED", label: "Damaged" },
];

export default function NewTransferPage() {
  const router = useRouter();
  const [fromGodownId, setFrom] = useState<string>("");
  const [toGodownId, setTo] = useState<string>("");
  const [date, setDate] = useState(toDateInput());
  const [notes, setNotes] = useState("");
  const [toBranchId, setToBranchId] = useState<string | null>(null);
  const [vehicleNo, setVehicleNo] = useState("");
  const [driverName, setDriverName] = useState("");
  const { branchId } = useSession();
  const interBranch = !!toBranchId && toBranchId !== branchId;
  const [busy, setBusy] = useState(false);
  const [key] = useState(newIdempotencyKey);
  const L = useLines<Line>(() => ({ productId: null, product: null, batchId: null, fromRackId: null, toRackId: null, fromStockType: "SALEABLE", toStockType: "SALEABLE", qtyPcs: 0 }));

  const save = async () => {
    const body = validate(inventoryTransferSchema, {
      date,
      fromGodownId,
      toGodownId,
      notes,
      vehicleNo: interBranch ? vehicleNo || null : null,
      driverName: interBranch ? driverName || null : null,
      lines: L.plain().map(({ product: _p, ...l }) => (interBranch ? { ...l, fromStockType: "SALEABLE", toStockType: "SALEABLE" } : l)),
    });
    if (!body) return;
    setBusy(true);
    try {
      const doc = await api<{ number: string }>("/stock/transfers", { method: "POST", body, idempotencyKey: key });
      toast.success(interBranch ? `Transfer ${doc.number} dispatched — in transit until the other branch receives it` : `Transfer ${doc.number} posted`);
      router.push("/inventory/transfers");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };
  const ref = useFormKeys<HTMLFormElement>(save);

  return (
    <>
      <PageHeader title="New stock transfer" back={{ href: "/inventory/transfers", label: "Transfers" }} />
      <form
        ref={ref}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="space-y-4"
      >
        <Section>
          <FormGrid cols={3}>
            <FieldShell label="From godown" required>
              <GodownSelect value={fromGodownId} onChange={setFrom} />
            </FieldShell>
            <FieldShell label="To godown" required hint={interBranch ? "Another branch: stock stays in transit until received there" : "Same godown is fine for rack or display moves; pick another branch to send stock there"}>
              <DestinationGodownSelect value={toGodownId} onChange={(id, g) => { setTo(id); setToBranchId(g?.branchId ?? null); }} />
            </FieldShell>
            <FieldShell label="Date">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </FieldShell>
          </FormGrid>
          {interBranch && (
            <FormGrid cols={3} className="mt-4">
              <FieldShell label="Vehicle number">
                <Input value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value.toUpperCase())} placeholder="TN 37 AB 1234" />
              </FieldShell>
              <FieldShell label="Driver">
                <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} />
              </FieldShell>
            </FormGrid>
          )}
        </Section>
        <Section title="Lines" actions={<AddLineButton onClick={L.add} />}>
          <LinesTable head={["Product", "Shade / batch", "From", "To", "Quantity", ""]}>
            {L.lines.map((l) => (
              <tr key={l._key} className="border-b border-border/60 align-top">
                <td className="w-72 p-2">
                  <ProductPicker value={l.productId} onChange={(id, p) => L.update(l._key, { productId: id, product: p, batchId: null })} />
                </td>
                <td className="w-64 p-2">
                  <BatchSelect productId={l.productId} godownId={fromGodownId || null} product={l.product} value={l.batchId} onChange={(id) => L.update(l._key, { batchId: id })} />
                </td>
                <td className="w-40 space-y-1 p-2">
                  <RackSelect godownId={fromGodownId} value={l.fromRackId} onChange={(id) => L.update(l._key, { fromRackId: id })} />
                  <NativeSelect disabled={interBranch} value={interBranch ? "SALEABLE" : l.fromStockType} onChange={(e) => L.update(l._key, { fromStockType: e.target.value as Line["fromStockType"] })} aria-label="From stock type">
                    {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </NativeSelect>
                </td>
                <td className="w-40 space-y-1 p-2">
                  <RackSelect godownId={toGodownId} value={l.toRackId} onChange={(id) => L.update(l._key, { toRackId: id })} emptyLabel="No rack" />
                  <NativeSelect disabled={interBranch} value={interBranch ? "SALEABLE" : l.toStockType} onChange={(e) => L.update(l._key, { toStockType: e.target.value as Line["toStockType"] })} aria-label="To stock type">
                    {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </NativeSelect>
                </td>
                <td className="p-2">
                  <QtyInput product={l.product} value={l.qtyPcs} onChange={(n) => L.update(l._key, { qtyPcs: n })} />
                </td>
                <td className="p-2">
                  <RemoveLineButton onClick={() => L.remove(l._key)} />
                </td>
              </tr>
            ))}
          </LinesTable>
        </Section>
        <Section>
          <FieldShell label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </FieldShell>
        </Section>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Posting…" : interBranch ? "Dispatch transfer" : "Post transfer"}
          </Button>
        </div>
      </form>
    </>
  );
}
