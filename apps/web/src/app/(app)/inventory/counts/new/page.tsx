"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PageHeader, Section } from "@/components/common/page-header";
import { FieldShell, FormGrid } from "@/components/common/form-fields";
import { EntitySelect } from "@/components/common/entity-select";
import { GodownSelect, RackSelect } from "@/components/inventory/pickers";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { api, ApiError, newIdempotencyKey } from "@/lib/api";

export default function NewCountPage() {
  const router = useRouter();
  const [godownId, setGodownId] = useState("");
  const [rackId, setRackId] = useState<string | null>(null);
  const [brandId, setBrandId] = useState<string | null>(null);
  const [blind, setBlind] = useState(true);
  const [busy, setBusy] = useState(false);
  const [key] = useState(newIdempotencyKey);

  const start = async () => {
    if (!godownId) return toast.error("Choose a godown");
    setBusy(true);
    try {
      const doc = await api<{ id: string; number: string }>("/stock/counts", { method: "POST", body: { godownId, rackId, brandId, blind }, idempotencyKey: key });
      toast.success(`Count ${doc.number} started`);
      router.push(`/inventory/counts/${doc.id}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not start the count");
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="New stock count" back={{ href: "/inventory/counts", label: "Stock counts" }} description="The count sheet lists every shade the system holds in this location right now." />
      <Section>
        <FormGrid>
          <FieldShell label="Godown" required>
            <GodownSelect value={godownId} onChange={(id) => { setGodownId(id); setRackId(null); }} />
          </FieldShell>
          <FieldShell label="Rack" hint="Leave empty to count the whole godown">
            <RackSelect godownId={godownId} value={rackId} onChange={setRackId} emptyLabel="All racks" />
          </FieldShell>
          <FieldShell label="Brand" hint="Optional: count one brand at a time">
            <EntitySelect endpoint="/brands" value={brandId} onChange={(id) => setBrandId(id)} getLabel={(b: any) => b.name} clearable placeholder="All brands" />
          </FieldShell>
          <label className="flex items-center justify-between gap-3 self-end rounded-md bg-fill px-3 py-2 text-[13.5px]">
            <span>
              Blind count
              <span className="block text-[12px] text-muted-foreground">Counters don't see the system quantity</span>
            </span>
            <Switch checked={blind} onCheckedChange={setBlind} />
          </label>
        </FormGrid>
        <div className="mt-4 flex justify-end">
          <Button onClick={start} disabled={busy}>{busy ? "Starting…" : "Start count"}</Button>
        </div>
      </Section>
    </>
  );
}
