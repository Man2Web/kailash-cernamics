"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { allocateLandedCost, formatINR, GRADES, labelOf, purchaseGrnSchema, toDateInput } from "@gc/shared";
import { PageHeader, Section } from "@/components/common/page-header";
import { FieldShell, FormGrid, MoneyInput, NativeSelect } from "@/components/common/form-fields";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { GodownSelect, isTileProduct, ProductPicker, QtyInput, RackSelect, SupplierPicker, type ProductLite } from "@/components/inventory/pickers";
import { LinesTable } from "@/components/inventory/doc-actions";
import { AddLineButton, RemoveLineButton, useLines, validate } from "@/components/inventory/line-editor";
import { RateInput, TotalsBox } from "@/components/purchase/rate";
import { useFormKeys } from "@/hooks/use-form-keys";
import { api, apiGet, ApiError, newIdempotencyKey } from "@/lib/api";
import { useSession } from "@/lib/session";
import { VariantSelect } from "@/components/purchase/variant-select";

interface Line {
  poLineId: string | null;
  productId: string | null;
  product: ProductLite | null;
  /** sanitary/CP colour variant (stocked as its own lot) */
  variantId: string | null;
  batchNo: string;
  shadeCode: string;
  caliber: string;
  grade: (typeof GRADES)[number];
  rackId: string | null;
  qtyPcs: number;
  damagedPcs: number;
  ratePaise: number;
}

const blank = (): Line => ({ poLineId: null, productId: null, product: null, variantId: null, batchNo: "", shadeCode: "", caliber: "", grade: "STANDARD", rackId: null, qtyPcs: 0, damagedPcs: 0, ratePaise: 0 });

function GrnForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const poId = sp.get("poId");
  const { can } = useSession();
  const [supplierId, setSupplier] = useState<string | null>(null);
  const [godownId, setGodown] = useState("");
  const [date, setDate] = useState(toDateInput());
  const [truckNo, setTruck] = useState("");
  const [containerNo, setContainer] = useState("");
  const [supplierInvoiceNo, setInv] = useState("");
  const [freightPaise, setFreight] = useState(0);
  const [unloadingPaise, setUnloading] = useState(0);
  const [otherChargesPaise, setOther] = useState(0);
  const [allocationBasis, setBasis] = useState<"VALUE" | "WEIGHT">("VALUE");
  const [poNumber, setPoNumber] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [key] = useState(newIdempotencyKey);
  const L = useLines<Line>(blank);

  useEffect(() => {
    if (!poId) return;
    apiGet<any>(`/purchase-orders/${poId}`)
      .then((po) => {
        setSupplier(po.supplier.id);
        setPoNumber(po.number);
        const lines: Line[] = po.lines
          .filter((l: any) => l.qtyPcs > l.receivedPcs)
          .map((l: any) => ({ ...blank(), poLineId: l.id, productId: l.productId, product: l.product, qtyPcs: l.qtyPcs - l.receivedPcs, ratePaise: Number(l.ratePaise) }));
        if (lines.length) L.setLines(lines.map((l) => ({ ...l, _key: newIdempotencyKey() })));
      })
      .catch((e) => toast.error(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poId]);

  const charges = freightPaise + unloadingPaise + otherChargesPaise;
  const alloc = useMemo(
    () =>
      allocateLandedCost(
        L.lines.map((l) => ({
          qtyPcs: l.qtyPcs,
          ratePaise: l.ratePaise,
          weightKg: l.product?.weightPerBoxKg && l.product.pcsPerBox ? (l.product.weightPerBoxKg * l.qtyPcs) / l.product.pcsPerBox : null,
        })),
        charges,
        allocationBasis,
      ),
    [L.lines, charges, allocationBasis],
  );
  const goodsValue = L.lines.reduce((a, l) => a + l.qtyPcs * l.ratePaise, 0);

  const save = async (post: boolean) => {
    const body = validate(purchaseGrnSchema, {
      supplierId,
      poId,
      godownId,
      date,
      truckNo,
      containerNo,
      supplierInvoiceNo,
      freightPaise,
      unloadingPaise,
      otherChargesPaise,
      allocationBasis,
      lines: L.plain().map(({ product: _p, ...l }) => l),
    });
    if (!body) return;
    const missing = L.lines.findIndex((l) => isTileProduct(l.product) && (!l.batchNo || !l.shadeCode || !l.caliber));
    if (post && missing >= 0) {
      toast.error(`Line ${missing + 1}: enter batch no, shade and caliber for tiles`);
      return;
    }
    setBusy(true);
    try {
      const grn = await api<{ id: string; number: string }>("/grns", { method: "POST", body, idempotencyKey: key });
      if (post) await api(`/grns/${grn.id}/post`, { method: "POST", body: {} });
      toast.success(post ? `${grn.number} posted — stock updated` : `${grn.number} saved as draft`);
      router.push(`/purchase/grn/${grn.id}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };
  const ref = useFormKeys<HTMLFormElement>(() => save(false));

  return (
    <>
      <PageHeader title="New GRN" description={poNumber ? `Against ${poNumber}` : "Direct receipt (no PO)"} back={{ href: "/purchase/grn", label: "GRN" }} />
      <form ref={ref} onSubmit={(e) => { e.preventDefault(); save(true); }} className="space-y-4">
        <Section>
          <FormGrid cols={3}>
            <FieldShell label="Supplier" required>
              <SupplierPicker value={supplierId} onChange={(id) => setSupplier(id)} />
            </FieldShell>
            <FieldShell label="Receive into godown" required>
              <GodownSelect value={godownId} onChange={setGodown} />
            </FieldShell>
            <FieldShell label="Date">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </FieldShell>
            <FieldShell label="Supplier invoice no.">
              <Input value={supplierInvoiceNo} onChange={(e) => setInv(e.target.value)} />
            </FieldShell>
            <FieldShell label="Truck no.">
              <Input value={truckNo} onChange={(e) => setTruck(e.target.value.toUpperCase())} placeholder="TN 38 AB 1234" />
            </FieldShell>
            <FieldShell label="Container no.">
              <Input value={containerNo} onChange={(e) => setContainer(e.target.value.toUpperCase())} />
            </FieldShell>
          </FormGrid>
        </Section>

        <Section title="Items received" actions={<AddLineButton onClick={L.add} />}>
          <LinesTable head={["Product", "Batch / shade / caliber / grade", "Rack", "Received", "Damaged", "Rate", "Landed / pc", ""]}>
            {L.lines.map((l, i) => {
              const tile = isTileProduct(l.product);
              return (
                <tr key={l._key} className="border-b border-border/60 align-top">
                  <td className="w-64 p-2">
                    <ProductPicker value={l.productId} onChange={(id, p) => L.update(l._key, { productId: id, product: p, variantId: null })} />
                  </td>
                  <td className="w-72 p-2">
                    {tile ? (
                      <div className="grid grid-cols-2 gap-1">
                        <Input aria-label="Batch no" placeholder="Batch no" value={l.batchNo} onChange={(e) => L.update(l._key, { batchNo: e.target.value })} />
                        <Input aria-label="Shade" placeholder="Shade" value={l.shadeCode} onChange={(e) => L.update(l._key, { shadeCode: e.target.value.toUpperCase() })} />
                        <Input aria-label="Caliber" placeholder="Caliber" value={l.caliber} onChange={(e) => L.update(l._key, { caliber: e.target.value.toUpperCase() })} />
                        <NativeSelect aria-label="Grade" value={l.grade} onChange={(e) => L.update(l._key, { grade: e.target.value as Line["grade"] })}>
                          {GRADES.map((g) => <option key={g} value={g}>{labelOf(g)}</option>)}
                        </NativeSelect>
                      </div>
                    ) : (
                      <VariantSelect productId={l.productId} value={l.variantId} onChange={(id) => L.update(l._key, { variantId: id })} />
                    )}
                  </td>
                  <td className="w-28 p-2"><RackSelect godownId={godownId} value={l.rackId} onChange={(id) => L.update(l._key, { rackId: id })} emptyLabel="No rack" /></td>
                  <td className="p-2"><QtyInput product={l.product} value={l.qtyPcs} onChange={(n) => L.update(l._key, { qtyPcs: n })} /></td>
                  <td className="w-24 p-2">
                    <Input type="number" inputMode="numeric" aria-label="Damaged pieces" className="tabular" value={l.damagedPcs || ""} placeholder="pcs" onChange={(e) => L.update(l._key, { damagedPcs: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })} />
                  </td>
                  <td className="p-2"><RateInput product={l.product} ratePaise={l.ratePaise} onChange={(r) => L.update(l._key, { ratePaise: r })} /></td>
                  <td className="p-2 text-right tabular">{can("cost.read") ? formatINR(alloc[i]?.landedRatePaise ?? 0) : "—"}</td>
                  <td className="p-2"><RemoveLineButton onClick={() => L.remove(l._key)} /></td>
                </tr>
              );
            })}
          </LinesTable>
        </Section>

        <Section title="Freight & charges">
          <div className="grid gap-4 md:grid-cols-2">
            <FormGrid>
              <FieldShell label="Freight"><MoneyInput value={freightPaise} onChange={setFreight} /></FieldShell>
              <FieldShell label="Unloading"><MoneyInput value={unloadingPaise} onChange={setUnloading} /></FieldShell>
              <FieldShell label="Other charges"><MoneyInput value={otherChargesPaise} onChange={setOther} /></FieldShell>
              <FieldShell label="Spread charges by">
                <NativeSelect value={allocationBasis} onChange={(e) => setBasis(e.target.value as "VALUE" | "WEIGHT")}>
                  <option value="VALUE">Value</option>
                  <option value="WEIGHT">Weight</option>
                </NativeSelect>
              </FieldShell>
            </FormGrid>
            <TotalsBox
              rows={[
                { label: "Goods value", value: formatINR(goodsValue) },
                { label: "Charges", value: formatINR(charges) },
                { label: "Landed value", value: formatINR(goodsValue + charges), strong: true },
              ]}
            />
          </div>
        </Section>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" disabled={busy} onClick={() => save(false)}>Save draft</Button>
          <Button type="submit" disabled={busy}>{busy ? "Posting…" : "Save & post stock"}</Button>
        </div>
      </form>
    </>
  );
}

export default function NewGrnPage() {
  return (
    <Suspense>
      <GrnForm />
    </Suspense>
  );
}
