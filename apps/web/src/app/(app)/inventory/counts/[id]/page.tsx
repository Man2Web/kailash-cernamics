"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { formatDate, formatINR, splitBoxes } from "@gc/shared";
import { PageHeader, Section, InfoGrid } from "@/components/common/page-header";
import { ErrorState, LoadingPage } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { ScanBox } from "@/components/inventory-ops/scanner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { api, apiGet, ApiError, useApi } from "@/lib/api";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

interface Line {
  id: string;
  productId: string;
  batchId: string;
  rack: { id: string; code: string } | null;
  stockType: string;
  systemPcs: number | null;
  countedPcs: number | null;
  variancePcs: number | null;
  systemText: string | null;
  countedText: string | null;
  varianceText: string | null;
  product: { id: string; sku: string; name: string; uomType: string; pcsPerBox: number | null; sqftPerBox: number | null; unitName: string | null };
  batch: { id: string; batchNo: string; shadeCode: string; caliber: string };
}
interface Count {
  id: string;
  number: string;
  date: string;
  status: string;
  blind: boolean;
  hideSystem: boolean;
  godown: { id: string; name: string };
  progress: { counted: number; total: number };
  variance: { plusPcs: number; minusPcs: number; linesDiffering: number; valuePaise?: number } | null;
  lines: Line[];
}

/** Boxes + loose pieces entry; empty means "not counted yet". */
function CountInput({ line, value, onChange, disabled }: { line: Line; value: number | null; onChange: (pcs: number | null) => void; disabled?: boolean }) {
  const tile = line.product.uomType === "PIECE_BOX_AREA" && !!line.product.pcsPerBox;
  const P = line.product.pcsPerBox ?? 1;
  const split = value === null ? null : splitBoxes(value, P);
  const set = (boxes: string, loose: string) => {
    if (boxes === "" && loose === "") return onChange(null);
    onChange((Number(boxes) || 0) * (tile ? P : 1) + (tile ? Number(loose) || 0 : 0));
  };
  if (!tile) {
    return <Input inputMode="numeric" className="h-11 w-24 text-center text-[16px] tabular" value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} placeholder="nos" aria-label="Counted units" />;
  }
  return (
    <div className="flex items-center gap-1">
      <Input inputMode="numeric" className="h-11 w-20 text-center text-[16px] tabular" value={split ? split.boxes : ""} disabled={disabled} onChange={(e) => set(e.target.value, String(split?.loose ?? ""))} placeholder="box" aria-label="Boxes" />
      <span className="text-muted-foreground">+</span>
      <Input inputMode="numeric" className="h-11 w-16 text-center text-[16px] tabular" value={split && split.loose ? split.loose : ""} disabled={disabled} onChange={(e) => set(String(split?.boxes ?? 0), e.target.value)} placeholder="pcs" aria-label="Loose pieces" />
    </div>
  );
}

export default function CountSheetPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const q = useApi<Count>(`/stock/counts/${id}`);
  const [draft, setDraft] = useState<Record<string, number | null>>({});
  const [busy, setBusy] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (q.data) setDraft(Object.fromEntries(q.data.lines.map((l) => [l.id, l.countedPcs])));
  }, [q.data]);

  const groups = useMemo(() => {
    const m = new Map<string, Line[]>();
    for (const l of q.data?.lines ?? []) {
      const k = l.rack?.code ?? "No rack";
      m.set(k, [...(m.get(k) ?? []), l]);
    }
    return [...m.entries()];
  }, [q.data]);

  if (q.isLoading) return <LoadingPage />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const c = q.data;
  const editable = c.status === "COUNTING" && can("stock.count");
  const dirty = c.lines.filter((l) => draft[l.id] !== l.countedPcs);
  const counted = c.lines.filter((l) => draft[l.id] !== null && draft[l.id] !== undefined).length;

  const save = async () => {
    if (!dirty.length) return true;
    setBusy(true);
    try {
      await api(`/stock/counts/${id}/lines`, { method: "PATCH", body: { lines: dirty.map((l) => ({ lineId: l.id, countedPcs: draft[l.id] ?? null })) } });
      await q.refetch();
      toast.success("Count saved");
      return true;
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not save");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!(await save())) return;
    const uncounted = c.lines.length - counted;
    if (uncounted && !confirm(`${uncounted} line(s) are not counted. Treat them as zero (missing)?`)) return;
    setBusy(true);
    try {
      const r = await api<{ status: string }>(`/stock/counts/${id}/submit`, { method: "POST", body: { treatUncountedAsZero: uncounted > 0 } });
      toast.success(r.status === "POSTED" ? "No differences — count closed" : "Sent for approval");
      q.refetch();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not submit");
    } finally {
      setBusy(false);
    }
  };

  const onScan = async (code: string) => {
    try {
      const r = await apiGet<{ kind: string; batch?: { id: string }; rack?: { id: string } }>("/scan/resolve", { code });
      const line = r.kind === "BATCH" ? c.lines.find((l) => l.batch.id === r.batch?.id) : r.kind === "RACK" ? c.lines.find((l) => l.rack?.id === r.rack?.id) : null;
      if (!line) return toast.error(r.kind === "BATCH" ? "This shade is not on the sheet — add it as found stock from the stock page" : "Not on this count sheet");
      setFocusId(line.id);
      rowRefs.current[line.id]?.scrollIntoView({ behavior: "smooth", block: "center" });
      rowRefs.current[line.id]?.querySelector("input")?.focus();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Scan failed");
    }
  };

  return (
    <>
      <PageHeader
        title={`Count ${c.number}`}
        back={{ href: "/inventory/counts", label: "Stock counts" }}
        description={`${c.godown.name} · ${formatDate(c.date)}${c.blind ? " · blind count" : ""}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={c.status} />
            {editable && (
              <>
                <Button size="sm" variant="secondary" onClick={save} disabled={busy || !dirty.length}>Save ({dirty.length})</Button>
                <Button size="sm" onClick={submit} disabled={busy}>Submit count</Button>
                <Button size="sm" variant="ghost" onClick={async () => { if (confirm("Cancel this count?")) { await api(`/stock/counts/${id}/cancel`, { method: "POST", body: {} }); q.refetch(); } }}>Cancel</Button>
              </>
            )}
          </div>
        }
      />
      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto]">
        {editable && (
          <Section>
            <ScanBox onScan={onScan} placeholder="Scan a box or rack label to jump to it" />
          </Section>
        )}
        <Section>
          <InfoGrid
            className="md:grid-cols-2"
            items={[
              { label: "Counted", value: `${counted} / ${c.lines.length}` },
              ...(c.variance
                ? [
                    { label: "Lines differing", value: c.variance.linesDiffering },
                    { label: "Excess / short pcs", value: `+${c.variance.plusPcs} / ${c.variance.minusPcs}` },
                    ...(c.variance.valuePaise !== undefined ? [{ label: "Variance value", value: formatINR(c.variance.valuePaise) }] : []),
                  ]
                : []),
            ]}
          />
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-fill">
            <div className="h-full bg-tint" style={{ width: `${c.lines.length ? (counted / c.lines.length) * 100 : 0}%` }} />
          </div>
        </Section>
      </div>
      <div className="space-y-4">
        {groups.map(([rack, lines]) => (
          <Section key={rack} title={rack === "No rack" ? "Not in a rack" : `Rack ${rack}`}>
            <div className="divide-y divide-border">
              {lines.map((l) => {
                const val = draft[l.id] ?? null;
                const variance = !c.hideSystem && val !== null && l.systemPcs !== null ? val - l.systemPcs : null;
                return (
                  <div
                    key={l.id}
                    ref={(el) => {
                      rowRefs.current[l.id] = el;
                    }}
                    className={cn("flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between", focusId === l.id && "rounded-lg bg-tint/10 px-2")}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{l.product.name}</div>
                      <div className="text-[12px] text-muted-foreground">
                        {l.product.sku} · shade <b>{l.batch.shadeCode}</b> · {l.batch.batchNo} · cal {l.batch.caliber}
                        {l.stockType !== "SALEABLE" && <> · <StatusBadge status={l.stockType} /></>}
                      </div>
                      {!c.hideSystem && l.systemText && <div className="text-[12px] text-muted-foreground">System: {l.systemText}</div>}
                    </div>
                    <div className="flex items-center gap-3">
                      <CountInput line={l} value={val} onChange={(v) => setDraft((d) => ({ ...d, [l.id]: v }))} disabled={!editable} />
                      {variance !== null && (
                        <span className={cn("w-16 text-right text-[13px] font-medium tabular", variance > 0 ? "text-ios-green" : variance < 0 ? "text-ios-red" : "text-muted-foreground")}>
                          {variance > 0 ? `+${variance}` : variance} pcs
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        ))}
      </div>
    </>
  );
}
