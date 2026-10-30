"use client";

import { useEffect } from "react";
import { formatBoxes, formatQty, splitBoxes } from "@gc/shared";
import { Input } from "@/components/ui/input";
import { EntitySelect } from "@/components/common/entity-select";
import { NativeSelect } from "@/components/common/form-fields";
import { useApi } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface ProductLite {
  id: string;
  sku: string;
  name: string;
  uomType: string;
  unitName: string | null;
  pcsPerBox: number | null;
  sqftPerBox: number | null;
  gstRate?: number;
  weightPerBoxKg?: number | null;
  brand?: { name: string } | null;
  size?: { name: string } | null;
}

export const isTileProduct = (p?: { uomType: string } | null) => p?.uomType === "PIECE_BOX_AREA";

export function ProductPicker({ value, onChange, className, autoFocus }: { value: string | null | undefined; onChange: (id: string | null, p: ProductLite | null) => void; className?: string; autoFocus?: boolean }) {
  return (
    <EntitySelect<ProductLite>
      endpoint="/products"
      value={value}
      onChange={onChange}
      getLabel={(p) => `${p.sku} · ${p.name}`}
      getDescription={(p) => [p.brand?.name, p.size?.name, p.pcsPerBox ? `${p.pcsPerBox} pcs/box · ${p.sqftPerBox} sq ft/box` : p.unitName].filter(Boolean).join(" · ")}
      placeholder="Search SKU, name or size…"
      className={className}
      autoFocus={autoFocus}
    />
  );
}

export function SupplierPicker({ value, onChange, className }: { value: string | null | undefined; onChange: (id: string | null, p: any) => void; className?: string }) {
  return (
    <EntitySelect<{ id: string; name: string; phone?: string | null; stateCode?: string; gstin?: string | null }>
      endpoint="/parties"
      params={{ type: "SUPPLIER" }}
      value={value}
      onChange={onChange}
      getLabel={(p) => p.name}
      getDescription={(p) => [p.gstin, p.phone].filter(Boolean).join(" · ")}
      placeholder="Select supplier…"
      className={className}
    />
  );
}

interface Godown {
  id: string;
  name: string;
  code: string;
  isDisplay?: boolean;
}

/** Godowns of the current branch (small list → native select). */
export function GodownSelect({ value, onChange, id, className, placeholder = "Select godown" }: { value: string | null | undefined; onChange: (id: string) => void; id?: string; className?: string; placeholder?: string }) {
  const q = useApi<{ items: Godown[] }>("/godowns", { pageSize: 200 });
  const items = q.data?.items ?? [];
  useEffect(() => {
    if (!value && items.length === 1) onChange(items[0].id);
  }, [items, value, onChange]);
  return (
    <NativeSelect id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={className}>
      <option value="">{q.isLoading ? "Loading…" : placeholder}</option>
      {items.map((g) => (
        <option key={g.id} value={g.id}>
          {g.name}
          {g.isDisplay ? " (showroom)" : ""}
        </option>
      ))}
    </NativeSelect>
  );
}

export function RackSelect({ godownId, value, onChange, className, emptyLabel = "Any rack" }: { godownId: string | null | undefined; value: string | null | undefined; onChange: (id: string | null) => void; className?: string; emptyLabel?: string }) {
  const q = useApi<{ items: { id: string; code: string; name?: string | null }[] }>(godownId ? "/racks" : null, { godownId: godownId ?? undefined, pageSize: 500 });
  return (
    <NativeSelect value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} className={className} disabled={!godownId} aria-label="Rack">
      <option value="">{emptyLabel}</option>
      {q.data?.items.map((r) => (
        <option key={r.id} value={r.id}>
          {r.code}
        </option>
      ))}
    </NativeSelect>
  );
}

export interface AvailabilityRow {
  batchId: string;
  godownId: string;
  saleable: number;
  reserved: number;
  available: number;
  batch: { id: string; batchNo: string; shadeCode: string; caliber: string; grade: string };
  godown: { id: string; name: string };
}

/** Batch / shade picker with available quantity per batch (optionally limited to one godown). */
export function BatchSelect({ productId, godownId, value, onChange, product, className }: { productId: string | null | undefined; godownId?: string | null; value: string | null | undefined; onChange: (id: string) => void; product?: ProductLite | null; className?: string }) {
  const q = useApi<AvailabilityRow[]>(productId ? "/stock/availability" : null, { productId: productId ?? undefined });
  const byBatch = new Map<string, { batch: AvailabilityRow["batch"]; available: number }>();
  for (const r of q.data ?? []) {
    if (godownId && r.godownId !== godownId) continue;
    const cur = byBatch.get(r.batchId) ?? { batch: r.batch, available: 0 };
    cur.available += r.available;
    byBatch.set(r.batchId, cur);
  }
  const rows = [...byBatch.values()];
  useEffect(() => {
    if (!value && rows.length === 1) onChange(rows[0].batch.id);
  }, [rows, value, onChange]);
  return (
    <NativeSelect value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={className} disabled={!productId} aria-label="Batch / shade">
      <option value="">{q.isLoading ? "Loading…" : rows.length ? "Select shade / batch" : "No stock"}</option>
      {rows.map((r) => (
        <option key={r.batch.id} value={r.batch.id}>
          {r.batch.batchNo === "DEFAULT" ? "Default" : `Shade ${r.batch.shadeCode} · ${r.batch.batchNo} · Cal ${r.batch.caliber}`} — {product?.pcsPerBox ? formatBoxes(r.available, product.pcsPerBox) : r.available} available
        </option>
      ))}
    </NativeSelect>
  );
}

/** Quantity entry in boxes + loose pieces for tiles (stored as pieces), plain number for units. */
export function QtyInput({ product, value, onChange, className, allowNegative }: { product: ProductLite | null | undefined; value: number | null | undefined; onChange: (pcs: number) => void; className?: string; allowNegative?: boolean }) {
  const pcs = value ?? 0;
  if (!isTileProduct(product) || !product?.pcsPerBox) {
    return (
      <Input
        type="number"
        inputMode="numeric"
        aria-label="Quantity"
        className={cn("tabular", className)}
        value={value ?? ""}
        min={allowNegative ? undefined : 0}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Math.trunc(Number(e.target.value)))}
        placeholder={product?.unitName ?? "Qty"}
      />
    );
  }
  const P = product.pcsPerBox;
  const sign = pcs < 0 ? -1 : 1;
  const { boxes, loose } = splitBoxes(Math.abs(pcs), P);
  const set = (b: number, l: number) => onChange(sign * (Math.max(0, b) * P + Math.max(0, l)));
  return (
    <div className={cn("flex min-w-0 items-center gap-1", className)}>
      {allowNegative && (
        <button type="button" onClick={() => onChange(-pcs)} className="h-9 rounded-md bg-fill px-2 text-[13px] font-semibold tabular" aria-label="Toggle add/remove">
          {sign < 0 ? "−" : "+"}
        </button>
      )}
      <Input type="number" inputMode="numeric" aria-label="Boxes" className="w-20 tabular" value={boxes || ""} placeholder="box" onChange={(e) => set(Math.trunc(Number(e.target.value) || 0), loose)} />
      <span className="text-[12px] text-muted-foreground">box</span>
      <Input type="number" inputMode="numeric" aria-label="Loose pieces" className="w-16 tabular" value={loose || ""} placeholder="pcs" onChange={(e) => set(boxes, Math.trunc(Number(e.target.value) || 0))} />
      <span className="text-[12px] text-muted-foreground">pcs</span>
    </div>
  );
}

export function QtyText({ pcs, product, className }: { pcs: number; product: ProductLite | null | undefined; className?: string }) {
  if (!product) return <span className={cn("tabular", className)}>{pcs}</span>;
  return <span className={cn("tabular", className)}>{formatQty(pcs, product)}</span>;
}
