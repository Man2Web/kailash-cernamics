"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { formatDate, formatINR, labelOf, purchaseSchemeSchema, toDateInput } from "@gc/shared";
import { PageHeader, Section } from "@/components/common/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { EntitySelect } from "@/components/common/entity-select";
import { FieldShell, FormGrid, MoneyInput, NativeSelect } from "@/components/common/form-fields";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { validate } from "@/components/inventory/line-editor";
import { api, ApiError, useApi, useApiMutation } from "@/lib/api";
import { useSession } from "@/lib/session";

interface Progress {
  achieved: number;
  achievedValuePaise: number;
  achievedSqft: number;
  currentSlab: { threshold: number; rebatePct: number } | null;
  nextSlab: { threshold: number; rebatePct: number } | null;
  toNextSlab: number;
  progressPct: number;
  expectedRebatePaise: number;
}

interface Scheme {
  id: string;
  name: string;
  periodFrom: string;
  periodTo: string;
  targetType: "VALUE" | "SQFT";
  isActive: boolean;
  brand: { name: string };
  slabs: { threshold: number; rebatePct: number }[];
}

const fmtTarget = (t: "VALUE" | "SQFT", v: number) => (t === "VALUE" ? formatINR(v) : `${v.toLocaleString("en-IN")} sq ft`);

function SchemeCard({ s }: { s: Scheme }) {
  const p = useApi<Progress>(`/schemes/${s.id}/progress`);
  const { can } = useSession();
  const claim = useApiMutation((amountPaise: number) => api(`/schemes/${s.id}/claims`, { method: "POST", body: { amountPaise } }), ["/schemes"]);
  return (
    <Section>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-[15px] font-semibold">{s.name}</div>
          <div className="text-[12px] text-muted-foreground">
            {s.brand.name} · {formatDate(s.periodFrom)} – {formatDate(s.periodTo)} · target by {labelOf(s.targetType).toLowerCase()}
          </div>
        </div>
        {p.data && (
          <div className="text-right">
            <div className="text-[12px] text-muted-foreground">Expected rebate</div>
            <div className="text-[18px] font-semibold text-ios-green tabular">{formatINR(p.data.expectedRebatePaise)}</div>
          </div>
        )}
      </div>
      {p.isLoading ? (
        <LoadingRows rows={2} />
      ) : p.data ? (
        <div className="mt-3 space-y-2">
          <div className="h-2.5 overflow-hidden rounded-full bg-fill">
            <div className="h-full rounded-full bg-tint" style={{ width: `${p.data.progressPct}%` }} />
          </div>
          <div className="flex flex-wrap justify-between gap-2 text-[12.5px]">
            <span>
              Achieved <b className="tabular">{fmtTarget(s.targetType, p.data.achieved)}</b>
              {p.data.currentSlab ? ` · slab ${p.data.currentSlab.rebatePct}%` : " · no slab reached yet"}
            </span>
            {p.data.nextSlab && (
              <span className="text-muted-foreground">
                {fmtTarget(s.targetType, p.data.toNextSlab)} more for {p.data.nextSlab.rebatePct}%
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {s.slabs.map((x) => (
              <span key={x.threshold} className="rounded-full bg-fill px-2 py-0.5 text-[11.5px] tabular">
                {fmtTarget(s.targetType, x.threshold)} → {x.rebatePct}%
              </span>
            ))}
          </div>
          {can("scheme.write") && p.data.expectedRebatePaise > 0 && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                if (!confirm(`Record a claim of ${formatINR(p.data!.expectedRebatePaise)}?`)) return;
                claim.mutate(p.data!.expectedRebatePaise, { onSuccess: () => toast.success("Claim recorded"), onError: (e) => toast.error(e.message) });
              }}
            >
              Record claim
            </Button>
          )}
        </div>
      ) : null}
    </Section>
  );
}

function NewSchemeDialog({ onClose }: { onClose: () => void }) {
  const [brandId, setBrand] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [targetType, setType] = useState<"VALUE" | "SQFT">("VALUE");
  const [periodFrom, setFrom] = useState(toDateInput());
  const [periodTo, setTo] = useState(toDateInput(new Date(Date.now() + 90 * 86400000)));
  const [slabs, setSlabs] = useState([{ threshold: 0, rebatePct: 1 }]);
  const save = useApiMutation((body: unknown) => api("/schemes", { method: "POST", body }), ["/schemes"]);
  const submit = () => {
    const body = validate(purchaseSchemeSchema, { brandId, name, targetType, periodFrom, periodTo, slabs });
    if (!body) return;
    save.mutate(body, { onSuccess: () => { toast.success("Scheme saved"); onClose(); }, onError: (e: ApiError) => toast.error(e.message) });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New brand scheme</DialogTitle>
        </DialogHeader>
        <FormGrid>
          <FieldShell label="Brand" required>
            <EntitySelect endpoint="/brands" value={brandId} onChange={(id) => setBrand(id)} getLabel={(b: { id: string; name: string }) => b.name} />
          </FieldShell>
          <FieldShell label="Name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Q3 purchase target" />
          </FieldShell>
          <FieldShell label="From"><Input type="date" value={periodFrom} onChange={(e) => setFrom(e.target.value)} /></FieldShell>
          <FieldShell label="To"><Input type="date" value={periodTo} onChange={(e) => setTo(e.target.value)} /></FieldShell>
          <FieldShell label="Target measured by">
            <NativeSelect value={targetType} onChange={(e) => setType(e.target.value as "VALUE" | "SQFT")}>
              <option value="VALUE">Purchase value (₹)</option>
              <option value="SQFT">Sq ft purchased</option>
            </NativeSelect>
          </FieldShell>
        </FormGrid>
        <div className="space-y-2">
          <div className="text-[13px] font-medium">Slabs</div>
          {slabs.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              {targetType === "VALUE" ? (
                <MoneyInput value={s.threshold} onChange={(v) => setSlabs((x) => x.map((y, j) => (j === i ? { ...y, threshold: v } : y)))} className="flex-1" />
              ) : (
                <Input type="number" className="flex-1 tabular" value={s.threshold || ""} placeholder="sq ft" onChange={(e) => setSlabs((x) => x.map((y, j) => (j === i ? { ...y, threshold: Math.trunc(Number(e.target.value) || 0) } : y)))} />
              )}
              <Input type="number" className="w-24 tabular" value={s.rebatePct} step="0.1" aria-label="Rebate %" onChange={(e) => setSlabs((x) => x.map((y, j) => (j === i ? { ...y, rebatePct: Number(e.target.value) } : y)))} />
              <span className="text-[12px] text-muted-foreground">%</span>
            </div>
          ))}
          <Button type="button" size="sm" variant="secondary" onClick={() => setSlabs((x) => [...x, { threshold: 0, rebatePct: 1 }])}>
            <Plus className="size-4" /> Add slab
          </Button>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save scheme"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SchemesPage() {
  const q = useApi<{ items: Scheme[] }>("/schemes", { pageSize: 100 });
  const { can } = useSession();
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHeader
        title="Brand schemes"
        description="Purchase targets with slab rebates. Progress counts posted purchase invoices of the brand in the period."
        actions={can("scheme.write") && <Button size="sm" onClick={() => setOpen(true)}><Plus className="size-4" /> New scheme</Button>}
      />
      {q.isLoading ? (
        <LoadingRows />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : !q.data?.items.length ? (
        <Section><EmptyState title="No schemes yet" description="Add the brand's purchase targets and rebate slabs to track expected rebates." /></Section>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {q.data.items.map((s) => <SchemeCard key={s.id} s={s} />)}
        </div>
      )}
      {open && <NewSchemeDialog onClose={() => setOpen(false)} />}
    </>
  );
}
