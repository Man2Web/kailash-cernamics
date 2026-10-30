"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, X } from "lucide-react";
import { BREAKAGE_STAGES, inventoryBreakageSchema, labelOf, toDateInput } from "@gc/shared";
import { PageHeader, Section } from "@/components/common/page-header";
import { FieldShell, FormGrid, NativeSelect } from "@/components/common/form-fields";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BatchSelect, GodownSelect, ProductPicker, QtyInput, RackSelect, type ProductLite } from "@/components/inventory/pickers";
import { validate } from "@/components/inventory/line-editor";
import { useFormKeys } from "@/hooks/use-form-keys";
import { api, ApiError, newIdempotencyKey, uploadFile } from "@/lib/api";

export default function NewBreakagePage() {
  const router = useRouter();
  const [stage, setStage] = useState<string>("GODOWN");
  const [godownId, setGodown] = useState("");
  const [rackId, setRack] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [product, setProduct] = useState<ProductLite | null>(null);
  const [batchId, setBatch] = useState<string | null>(null);
  const [qtyPcs, setQty] = useState(0);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(toDateInput());
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [key] = useState(newIdempotencyKey);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        const r = await uploadFile(f, "breakage");
        setPhotos((p) => [...p, r.url]);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    const body = validate(inventoryBreakageSchema, { stage, godownId, rackId, productId, batchId, qtyPcs, reason, date, photos });
    if (!body) return;
    setBusy(true);
    try {
      const doc = await api<{ number: string }>("/stock/breakage", { method: "POST", body, idempotencyKey: key });
      toast.success(`Breakage ${doc.number} recorded`);
      router.push("/inventory/breakage");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };
  const ref = useFormKeys<HTMLFormElement>(save);

  return (
    <>
      <PageHeader title="Record breakage" back={{ href: "/inventory/breakage", label: "Breakage" }} />
      <form ref={ref} onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-4">
        <Section>
          <FormGrid>
            <FieldShell label="Stage" required>
              <NativeSelect value={stage} onChange={(e) => setStage(e.target.value)}>
                {BREAKAGE_STAGES.map((s) => <option key={s} value={s}>{labelOf(s)}{s === "CUSTOMER" ? " (returned broken)" : ""}</option>)}
              </NativeSelect>
            </FieldShell>
            <FieldShell label="Date">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </FieldShell>
            <FieldShell label="Godown" required>
              <GodownSelect value={godownId} onChange={setGodown} />
            </FieldShell>
            <FieldShell label="Rack">
              <RackSelect godownId={godownId} value={rackId} onChange={setRack} />
            </FieldShell>
            <FieldShell label="Product" required className="md:col-span-2">
              <ProductPicker value={productId} onChange={(id, p) => { setProductId(id); setProduct(p); setBatch(null); }} />
            </FieldShell>
            <FieldShell label="Shade / batch" required>
              <BatchSelect productId={productId} godownId={godownId || null} product={product} value={batchId} onChange={setBatch} />
            </FieldShell>
            <FieldShell label="Broken quantity" required>
              <QtyInput product={product} value={qtyPcs} onChange={setQty} />
            </FieldShell>
            <FieldShell label="Reason" required className="md:col-span-2">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Dropped while unloading" />
            </FieldShell>
          </FormGrid>
        </Section>
        <Section title="Photos">
          <div className="flex flex-wrap gap-2">
            {photos.map((p) => (
              <div key={p} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p} alt="" className="size-20 rounded-md object-cover" />
                <button type="button" onClick={() => setPhotos((x) => x.filter((y) => y !== p))} className="absolute -top-1.5 -right-1.5 rounded-full bg-foreground p-0.5 text-background" aria-label="Remove photo">
                  <X className="size-3" />
                </button>
              </div>
            ))}
            <label className="grid size-20 cursor-pointer place-items-center rounded-md border border-dashed border-border text-muted-foreground hover:bg-fill">
              <span className="flex flex-col items-center gap-1 text-[11px]">
                <Camera className="size-5" />
                {uploading ? "Uploading…" : "Add photo"}
              </span>
              <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
            </label>
          </div>
        </Section>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
          <Button type="submit" disabled={busy || uploading}>{busy ? "Saving…" : "Record breakage"}</Button>
        </div>
      </form>
    </>
  );
}
