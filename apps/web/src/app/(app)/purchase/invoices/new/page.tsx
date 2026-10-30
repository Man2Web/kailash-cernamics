"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { computeDocTotals, formatINR, purchaseInvoiceSchema, toDateInput } from "@gc/shared";
import { PageHeader, Section } from "@/components/common/page-header";
import { FieldShell, FormGrid, MoneyInput, NativeSelect } from "@/components/common/form-fields";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ProductPicker, QtyInput, SupplierPicker, type ProductLite } from "@/components/inventory/pickers";
import { LinesTable } from "@/components/inventory/doc-actions";
import { AddLineButton, RemoveLineButton, useLines, validate } from "@/components/inventory/line-editor";
import { RateInput, TotalsBox } from "@/components/purchase/rate";
import { useFormKeys } from "@/hooks/use-form-keys";
import { api, apiGet, ApiError, newIdempotencyKey } from "@/lib/api";
import { useSession } from "@/lib/session";

interface Line {
  productId: string | null;
  product: ProductLite | null;
  qtyPcs: number;
  ratePaise: number;
  gstRate: number;
}

function InvoiceForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const grnId = sp.get("grnId");
  const { branch } = useSession();
  const [supplierId, setSupplier] = useState<string | null>(null);
  const [poId, setPoId] = useState<string | null>(null);
  const [supplierInvoiceNo, setInvNo] = useState("");
  const [date, setDate] = useState(toDateInput());
  const [otherChargesPaise, setOther] = useState(0);
  const [interState, setInter] = useState(false);
  const [busy, setBusy] = useState(false);
  const [key] = useState(newIdempotencyKey);
  const L = useLines<Line>(() => ({ productId: null, product: null, qtyPcs: 0, ratePaise: 0, gstRate: 18 }));

  useEffect(() => {
    if (!grnId) return;
    apiGet<any>(`/grns/${grnId}`)
      .then((g) => {
        setSupplier(g.supplierId);
        if (branch && g.supplier?.stateCode) setInter(g.supplier.stateCode !== branch.stateCode);
        setPoId(g.po?.id ?? null);
        if (g.supplierInvoiceNo) setInvNo(g.supplierInvoiceNo);
        L.setLines(
          g.lines.map((l: any) => ({ productId: l.productId, product: l.product, qtyPcs: l.qtyPcs, ratePaise: Number(l.ratePaise), gstRate: l.product?.gstRate ?? 18, _key: newIdempotencyKey() })),
        );
      })
      .catch((e) => toast.error(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grnId]);

  const totals = useMemo(() => computeDocTotals(L.lines.map((l) => ({ qtyPcs: l.qtyPcs, ratePaise: l.ratePaise, gstRate: l.gstRate })), interState, otherChargesPaise), [L.lines, interState, otherChargesPaise]);

  const save = async (post: boolean) => {
    const body = validate(purchaseInvoiceSchema, { supplierId, supplierInvoiceNo, date, poId, grnId, otherChargesPaise, lines: L.plain().map(({ product: _p, ...l }) => l) });
    if (!body) return;
    setBusy(true);
    try {
      const inv = await api<{ id: string; number: string; warnings: string[] }>("/purchase-invoices", { method: "POST", body, idempotencyKey: key });
      if (inv.warnings.length) toast.warning(`Check variances: ${inv.warnings[0]}${inv.warnings.length > 1 ? ` (+${inv.warnings.length - 1} more)` : ""}`);
      if (post) await api(`/purchase-invoices/${inv.id}/post`, { method: "POST", body: {} });
      toast.success(post ? `${inv.number} posted` : `${inv.number} saved as draft`);
      router.push(`/purchase/invoices/${inv.id}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };
  const ref = useFormKeys<HTMLFormElement>(() => save(false));

  return (
    <>
      <PageHeader title="New purchase invoice" back={{ href: "/purchase/invoices", label: "Purchase invoices" }} description={grnId ? "Pre-filled from the GRN" : undefined} />
      <form ref={ref} onSubmit={(e) => { e.preventDefault(); save(false); }} className="space-y-4">
        <Section>
          <FormGrid cols={3}>
            <FieldShell label="Supplier" required>
              <SupplierPicker value={supplierId} onChange={(id, s) => { setSupplier(id); setInter(!!s?.stateCode && !!branch && s.stateCode !== branch.stateCode); }} />
            </FieldShell>
            <FieldShell label="Supplier invoice no." required>
              <Input value={supplierInvoiceNo} onChange={(e) => setInvNo(e.target.value)} />
            </FieldShell>
            <FieldShell label="Invoice date">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </FieldShell>
          </FormGrid>
        </Section>
        <Section title="Items" actions={<AddLineButton onClick={L.add} />}>
          <LinesTable head={["Product", "Quantity", "Rate", "GST %", "Taxable", ""]}>
            {L.lines.map((l, i) => (
              <tr key={l._key} className="border-b border-border/60 align-top">
                <td className="w-80 p-2"><ProductPicker value={l.productId} onChange={(id, p) => L.update(l._key, { productId: id, product: p, gstRate: p?.gstRate ?? 18 })} /></td>
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
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <FieldShell label="Other charges on the bill (freight etc.)" className="max-w-xs">
              <MoneyInput value={otherChargesPaise} onChange={setOther} />
            </FieldShell>
            <TotalsBox
              rows={[
                { label: "Taxable value", value: formatINR(totals.taxablePaise) },
                ...(interState
                  ? [{ label: "IGST", value: formatINR(totals.igstPaise) }]
                  : [
                      { label: "CGST", value: formatINR(totals.cgstPaise) },
                      { label: "SGST", value: formatINR(totals.sgstPaise) },
                    ]),
                { label: "Other charges", value: formatINR(otherChargesPaise) },
                { label: "Round off", value: formatINR(totals.roundOffPaise) },
                { label: "Total", value: formatINR(totals.totalPaise), strong: true },
              ]}
            />
          </div>
        </Section>
        <div className="flex justify-end gap-2">
          <Button type="submit" variant="secondary" disabled={busy}>Save draft</Button>
          <Button type="button" disabled={busy} onClick={() => save(true)}>{busy ? "Saving…" : "Save & post"}</Button>
        </div>
      </form>
    </>
  );
}

export default function NewPurchaseInvoicePage() {
  return (
    <Suspense>
      <InvoiceForm />
    </Suspense>
  );
}
