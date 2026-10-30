"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2, AlertTriangle } from "lucide-react";
import {
  amountInWords,
  formatBoxes,
  formatINR,
  formatQty,
  isInterState,
  labelOf,
  piecesFromBoxes,
  salesDocTotals,
  salesLineAmounts,
  splitBoxes,
  stateName,
  type SalesProductSpec,
} from "@gc/shared";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EntitySelect } from "@/components/common/entity-select";
import { FieldShell, MoneyInput, NativeSelect } from "@/components/common/form-fields";
import { api, apiGet, ApiError, getBranchId, newIdempotencyKey } from "@/lib/api";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------- types

export interface ProductLite extends SalesProductSpec {
  id: string;
  sku: string;
  name: string;
  hsn?: string;
  unitName?: string | null;
  mrpPaise?: number;
  images?: string[];
  brand?: { name: string } | null;
  size?: { name: string } | null;
}

export interface PartyLite {
  id: string;
  name: string;
  phone?: string | null;
  stateCode: string;
  gstin?: string | null;
  segment?: string;
  sites?: { id: string; name: string; address?: string | null }[];
}

export interface EditLine {
  key: string;
  productId: string | null;
  product?: ProductLite | null;
  batchId?: string | null;
  godownId?: string | null;
  qtyPcs: number;
  priceBasis: "PER_SQFT" | "PER_BOX" | "PER_UNIT";
  enteredRatePaise: number;
  discountPct: number;
  orderLineId?: string | null;
}

export interface Availability {
  batchId: string;
  godownId: string;
  available: number;
  saleable: number;
  reserved: number;
  batchNo?: string;
  shadeCode?: string;
  caliber?: string;
  grade?: string;
  godownName?: string;
}

export const newKey = () => Math.random().toString(36).slice(2);

export function isTileProduct(p?: { uomType: string } | null) {
  return p?.uomType === "PIECE_BOX_AREA";
}

/** "12 box + 3 pcs (155.0 sq ft)" for tiles, "4 nos" for units. */
export function fmtQty(qtyPcs: number, p: ProductLite | null | undefined): string {
  if (!p) return String(qtyPcs);
  return formatQty(qtyPcs, { uomType: p.uomType, pcsPerBox: p.pcsPerBox ?? null, sqftPerBox: p.sqftPerBox ?? null, unitName: p.unitName });
}

export function productLabel(p: ProductLite) {
  return `${p.name} · ${p.sku}`;
}

export function productDescription(p: ProductLite) {
  return [p.brand?.name, p.size?.name, isTileProduct(p) && p.pcsPerBox ? `${p.pcsPerBox} pcs/box · ${p.sqftPerBox} sq ft/box` : p.unitName ?? "nos"]
    .filter(Boolean)
    .join(" · ");
}

export function emptyLine(): EditLine {
  return { key: newKey(), productId: null, product: null, qtyPcs: 0, priceBasis: "PER_UNIT", enteredRatePaise: 0, discountPct: 0 };
}

/** Default price for a product and customer (segment price list → retail → MRP). */
export async function fetchPrice(productId: string, partyId?: string | null) {
  return apiGet<{ priceBasis: EditLine["priceBasis"]; pricePaise: number; source: string }>("/sales/price", { productId, partyId: partyId ?? undefined });
}

// ---------------------------------------------------------------- party

export function useParty(partyId: string | null | undefined) {
  return useQuery({ queryKey: ["/parties", "one-full", partyId], queryFn: () => apiGet<PartyLite>(`/parties/${partyId}`), enabled: !!partyId });
}

export function useInterState(party?: PartyLite | null, placeOfSupply?: string | null) {
  const { branch } = useSession();
  const pos = placeOfSupply || party?.stateCode || branch?.stateCode || "33";
  return { interState: isInterState(branch?.stateCode ?? "33", pos), placeOfSupply: pos };
}

export function CustomerFields({
  partyId,
  siteId,
  influencerId,
  onChange,
  disabled,
}: {
  partyId: string | null;
  siteId: string | null;
  influencerId?: string | null;
  onChange: (v: { partyId?: string | null; siteId?: string | null; influencerId?: string | null }) => void;
  disabled?: boolean;
}) {
  const party = useParty(partyId);
  return (
    <>
      <FieldShell label="Customer" required>
        <EntitySelect<PartyLite>
          endpoint="/parties"
          params={{ type: "CUSTOMER" }}
          value={partyId}
          disabled={disabled}
          onChange={(id) => onChange({ partyId: id, siteId: null })}
          getLabel={(p) => p.name}
          getDescription={(p) => [p.phone, p.gstin, stateName(p.stateCode)].filter(Boolean).join(" · ")}
          placeholder="Search customer by name or phone…"
        />
      </FieldShell>
      <FieldShell label="Site" hint={party.data && !party.data.sites?.length ? "No sites for this customer" : undefined}>
        <NativeSelect value={siteId ?? ""} disabled={disabled || !party.data?.sites?.length} onChange={(e) => onChange({ siteId: e.target.value || null })}>
          <option value="">— No site —</option>
          {party.data?.sites?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </NativeSelect>
      </FieldShell>
      {influencerId !== undefined && (
        <FieldShell label="Influencer (architect, plumber…)">
          <EntitySelect<{ id: string; name: string; type: string }>
            endpoint="/influencers"
            value={influencerId}
            disabled={disabled}
            clearable
            onChange={(id) => onChange({ influencerId: id })}
            getLabel={(i) => `${i.name} (${labelOf(i.type)})`}
            placeholder="Optional"
          />
        </FieldShell>
      )}
    </>
  );
}

// ---------------------------------------------------------------- qty input

/** Tiles: boxes + loose pieces (loose only if allowed). Others: units. */
export function QtyInput({ product, qtyPcs, onChange, disabled }: { product?: ProductLite | null; qtyPcs: number; onChange: (pcs: number) => void; disabled?: boolean }) {
  if (isTileProduct(product) && product?.pcsPerBox) {
    const { boxes, loose } = splitBoxes(qtyPcs, product.pcsPerBox);
    return (
      <div className="flex items-center gap-1">
        <Input
          aria-label="Boxes"
          inputMode="numeric"
          className="h-8 w-16 px-2 tabular"
          disabled={disabled}
          value={boxes || ""}
          placeholder="0"
          onChange={(e) => onChange(piecesFromBoxes(Number(e.target.value.replace(/\D/g, "") || 0), loose, product.pcsPerBox!))}
        />
        <span className="text-[11px] text-muted-foreground">box</span>
        {product.allowLooseSale && (
          <>
            <Input
              aria-label="Loose pieces"
              inputMode="numeric"
              className="h-8 w-12 px-2 tabular"
              disabled={disabled}
              value={loose || ""}
              placeholder="0"
              onChange={(e) => onChange(piecesFromBoxes(boxes, Math.min(Number(e.target.value.replace(/\D/g, "") || 0), product.pcsPerBox! - 1), product.pcsPerBox!))}
            />
            <span className="text-[11px] text-muted-foreground">pcs</span>
          </>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <Input
        aria-label="Quantity"
        inputMode="numeric"
        className="h-8 w-20 px-2 tabular"
        disabled={disabled}
        value={qtyPcs || ""}
        placeholder="0"
        onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, "") || 0))}
      />
      <span className="text-[11px] text-muted-foreground">{product?.unitName || "nos"}</span>
    </div>
  );
}

export function BasisSelect({ product, value, onChange, disabled }: { product?: ProductLite | null; value: string; onChange: (v: EditLine["priceBasis"]) => void; disabled?: boolean }) {
  const tile = isTileProduct(product);
  return (
    <NativeSelect className="h-8 w-[92px] px-1.5 text-[12.5px]" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as EditLine["priceBasis"])} aria-label="Rate per">
      {tile && <option value="PER_SQFT">/ sq ft</option>}
      {tile && <option value="PER_BOX">/ box</option>}
      <option value="PER_UNIT">{tile ? "/ piece" : "/ unit"}</option>
    </NativeSelect>
  );
}

// ---------------------------------------------------------------- batches

export function useAvailability(productId: string | null | undefined) {
  return useQuery({
    queryKey: ["/sales/availability", productId],
    queryFn: () => apiGet<Availability[]>("/sales/availability", { productId: productId! }),
    enabled: !!productId,
    staleTime: 10_000,
  });
}

export function batchLabel(a: Availability, pcsPerBox?: number | null) {
  const shade = a.shadeCode && a.shadeCode !== "-" ? `Shade ${a.shadeCode} · ${a.batchNo} · ${a.caliber}` : a.batchNo === "DEFAULT" ? "Stock" : a.batchNo;
  return `${shade} — ${formatBoxes(a.available, pcsPerBox)} free · ${a.godownName ?? ""}`;
}

export function BatchSelect({ line, onChange, disabled }: { line: EditLine; onChange: (v: { batchId: string | null; godownId: string | null }) => void; disabled?: boolean }) {
  const av = useAvailability(line.productId);
  if (!line.productId) return <span className="text-[12px] text-muted-foreground">—</span>;
  const rows = av.data ?? [];
  const value = line.batchId ? `${line.batchId}|${line.godownId ?? ""}` : "";
  const chosen = rows.find((r) => r.batchId === line.batchId && (!line.godownId || r.godownId === line.godownId));
  const short = chosen && line.qtyPcs > chosen.available;
  return (
    <div className="min-w-0">
      <NativeSelect
        aria-label="Batch / shade"
        className={cn("h-8 px-1.5 text-[12.5px]", short && "border-ios-orange")}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const [b, g] = e.target.value.split("|");
          onChange({ batchId: b || null, godownId: g || null });
        }}
      >
        <option value="">Auto (one batch)</option>
        {rows.map((r) => (
          <option key={`${r.batchId}|${r.godownId}`} value={`${r.batchId}|${r.godownId}`}>
            {batchLabel(r, line.product?.pcsPerBox)}
          </option>
        ))}
      </NativeSelect>
      {short && <div className="mt-0.5 text-[11px] text-ios-orange">Only {formatBoxes(chosen!.available, line.product?.pcsPerBox)} free in this batch</div>}
      {av.data && !rows.length && <div className="mt-0.5 text-[11px] text-ios-red">No stock</div>}
    </div>
  );
}

// ---------------------------------------------------------------- lines editor

export function LinesEditor({
  lines,
  setLines,
  partyId,
  interState,
  showBatch = true,
  disabled,
}: {
  lines: EditLine[];
  setLines: (fn: (l: EditLine[]) => EditLine[]) => void;
  partyId?: string | null;
  interState: boolean;
  showBatch?: boolean;
  disabled?: boolean;
}) {
  const update = (key: string, patch: Partial<EditLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remove = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key));

  const pickProduct = async (key: string, product: ProductLite | null) => {
    if (!product) return update(key, { productId: null, product: null });
    const tile = isTileProduct(product);
    update(key, {
      productId: product.id,
      product,
      batchId: null,
      godownId: null,
      qtyPcs: tile && product.pcsPerBox ? product.pcsPerBox : 1,
      priceBasis: tile ? "PER_BOX" : "PER_UNIT",
      enteredRatePaise: Number(product.mrpPaise ?? 0),
    });
    try {
      const price = await fetchPrice(product.id, partyId);
      update(key, { priceBasis: price.priceBasis, enteredRatePaise: price.pricePaise });
    } catch {
      /* keep MRP */
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[920px] text-[13px]">
        <thead>
          <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
            <th className="w-8 py-2">#</th>
            <th className="py-2">Product</th>
            {showBatch && <th className="w-56 py-2">Batch / shade</th>}
            <th className="w-40 py-2">Quantity</th>
            <th className="w-52 py-2">Rate</th>
            <th className="w-16 py-2">Disc %</th>
            <th className="w-28 py-2 text-right">Amount</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const amt = l.product ? salesLineAmounts(l.product, l, interState) : null;
            return (
              <tr key={l.key} className="border-b border-border/60 align-top">
                <td className="py-2 text-muted-foreground tabular">{i + 1}</td>
                <td className="py-2 pr-2">
                  <EntitySelect<ProductLite>
                    endpoint="/products"
                    value={l.productId}
                    disabled={disabled || !!l.orderLineId}
                    onChange={(_id, item) => pickProduct(l.key, item)}
                    getLabel={productLabel}
                    getDescription={productDescription}
                    placeholder="Search SKU, name or size…"
                  />
                  {l.product && l.qtyPcs > 0 && <div className="mt-1 text-[11.5px] text-muted-foreground">{fmtQty(l.qtyPcs, l.product)}</div>}
                </td>
                {showBatch && (
                  <td className="py-2 pr-2">
                    {isTileProduct(l.product) ? (
                      <BatchSelect line={l} disabled={disabled || !!l.orderLineId} onChange={(v) => update(l.key, v)} />
                    ) : (
                      <span className="text-[12px] text-muted-foreground">{l.product ? "No shade" : "—"}</span>
                    )}
                  </td>
                )}
                <td className="py-2 pr-2">
                  <QtyInput product={l.product} qtyPcs={l.qtyPcs} disabled={disabled} onChange={(q) => update(l.key, { qtyPcs: q })} />
                </td>
                <td className="py-2 pr-2">
                  <div className="flex items-center gap-1">
                    <MoneyInput className="w-28" value={l.enteredRatePaise} disabled={disabled || !!l.orderLineId} onChange={(p) => update(l.key, { enteredRatePaise: p })} />
                    <BasisSelect product={l.product} value={l.priceBasis} disabled={disabled || !!l.orderLineId} onChange={(b) => update(l.key, { priceBasis: b })} />
                  </div>
                </td>
                <td className="py-2 pr-2">
                  <Input
                    aria-label="Discount %"
                    inputMode="decimal"
                    className="h-8 w-14 px-2 tabular"
                    disabled={disabled || !!l.orderLineId}
                    value={l.discountPct || ""}
                    placeholder="0"
                    onChange={(e) => update(l.key, { discountPct: Math.min(100, Number(e.target.value.replace(/[^\d.]/g, "") || 0)) })}
                  />
                </td>
                <td className="py-2 text-right tabular">
                  {amt ? formatINR(amt.taxablePaise) : "—"}
                  {amt && <div className="text-[11px] text-muted-foreground">+ GST {l.product?.gstRate}%</div>}
                </td>
                <td className="py-2 text-right">
                  {!disabled && (
                    <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => remove(l.key)} aria-label="Remove line">
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!disabled && (
        <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
          <Plus className="size-4" /> Add line
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- totals

export function useDocTotals(lines: EditLine[], interState: boolean, chargesPaise: number) {
  return useMemo(() => {
    const valid = lines.filter((l) => l.product && l.qtyPcs > 0);
    return salesDocTotals(
      valid.map((l) => ({ product: l.product!, line: l })),
      interState,
      chargesPaise,
      18,
    );
  }, [lines, interState, chargesPaise]);
}

export interface TotalsLike {
  subtotalPaise: number;
  discountPaise: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  roundOffPaise: number;
  totalPaise: number;
  transportPaise?: number;
  loadingPaise?: number;
  chargesPaise?: number;
}

export function TotalsPanel({ t, interState, className, children }: { t: TotalsLike; interState: boolean; className?: string; children?: React.ReactNode }) {
  const charges = t.chargesPaise ?? Number(t.transportPaise ?? 0) + Number(t.loadingPaise ?? 0);
  const row = (label: string, v: number, strong = false) => (
    <div className={cn("flex justify-between gap-4 py-1", strong && "border-t border-border pt-2 text-[16px] font-semibold")}>
      <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
      <span className="tabular">{formatINR(v)}</span>
    </div>
  );
  return (
    <div className={cn("rounded-xl bg-card p-4 text-[13.5px] shadow-card", className)}>
      {row("Gross", Number(t.subtotalPaise))}
      {Number(t.discountPaise) > 0 && row("Discount", -Number(t.discountPaise))}
      {row("Taxable value", Number(t.taxablePaise))}
      {charges > 0 && row("Transport & loading", charges)}
      {interState ? row("IGST", Number(t.igstPaise)) : (
        <>
          {row("CGST", Number(t.cgstPaise))}
          {row("SGST", Number(t.sgstPaise))}
        </>
      )}
      {Number(t.roundOffPaise) !== 0 && row("Round off", Number(t.roundOffPaise))}
      {row("Total", Number(t.totalPaise), true)}
      <p className="mt-1 text-[11.5px] text-muted-foreground">{amountInWords(Number(t.totalPaise))}</p>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- shortage / split

export interface ShortageInfo {
  message: string;
  productId: string;
  qtyPcs: number;
  lineRef?: string;
  batches: Availability[];
}

export class SalesConflict extends Error {
  constructor(public body: ShortageInfo & { code: string }) {
    super(body.message);
  }
}

/** Save a sales document; a 409 BATCH_SHORT comes back as SalesConflict with per-batch availability. */
export async function salesSave<T = any>(path: string, method: "POST" | "PATCH", body: unknown): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json", "Idempotency-Key": newIdempotencyKey() };
  const branch = getBranchId();
  if (branch) headers["X-Branch-Id"] = branch;
  const res = await fetch(`/api${path}`, { method, headers, credentials: "include", body: JSON.stringify(body) });
  if (res.status === 401) return api<T>(path, { method, body });
  const data = await res.json().catch(() => undefined);
  if (res.status === 409 && data?.code === "BATCH_SHORT") throw new SalesConflict(data);
  if (!res.ok) throw new ApiError(Array.isArray(data?.message) ? data.message.join(", ") : data?.message ?? res.statusText, res.status, data?.issues, data?.code);
  return data as T;
}

/** Split dialog: allocate the line's pieces across batches (each part reserves from one batch). */
export function SplitDialog({
  open,
  onClose,
  product,
  qtyPcs,
  batches,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  product?: ProductLite | null;
  qtyPcs: number;
  batches: Availability[];
  onApply: (parts: { batchId: string; godownId: string; qtyPcs: number }[]) => void;
}) {
  const [alloc, setAlloc] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!open) return;
    // greedy default: fill from the largest batches
    let left = qtyPcs;
    const a: Record<string, number> = {};
    for (const b of [...batches].sort((x, y) => y.available - x.available)) {
      if (left <= 0 || b.available <= 0) continue;
      const take = Math.min(left, b.available);
      a[`${b.batchId}|${b.godownId}`] = take;
      left -= take;
    }
    setAlloc(a);
  }, [open, batches, qtyPcs]);
  const total = Object.values(alloc).reduce((x, y) => x + (y || 0), 0);
  const P = product?.pcsPerBox;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Split across batches</DialogTitle>
        </DialogHeader>
        <p className="flex gap-2 rounded-md bg-ios-orange/10 p-2 text-[13px] text-ios-orange">
          <AlertTriangle className="size-4 shrink-0" /> No single batch has {formatBoxes(qtyPcs, P)}. Shades differ between batches — confirm with the customer.
        </p>
        <div className="space-y-2">
          {batches.map((b) => {
            const k = `${b.batchId}|${b.godownId}`;
            return (
              <div key={k} className="flex items-center justify-between gap-2 text-[13px]">
                <span className="min-w-0 truncate">{batchLabel(b, P)}</span>
                <Input
                  className="h-8 w-24 tabular"
                  inputMode="numeric"
                  value={alloc[k] || ""}
                  placeholder="pcs"
                  onChange={(e) => setAlloc((a) => ({ ...a, [k]: Math.min(b.available, Number(e.target.value.replace(/\D/g, "") || 0)) }))}
                />
              </div>
            );
          })}
        </div>
        <p className={cn("text-[13px]", total === qtyPcs ? "text-ios-green" : "text-muted-foreground")}>
          Allocated {formatBoxes(total, P)} of {formatBoxes(qtyPcs, P)} ({total}/{qtyPcs} pcs)
        </p>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={total <= 0}
            onClick={() =>
              onApply(
                Object.entries(alloc)
                  .filter(([, q]) => q > 0)
                  .map(([k, q]) => {
                    const [batchId, godownId] = k.split("|");
                    return { batchId, godownId, qtyPcs: q };
                  }),
              )
            }
          >
            Use these batches
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Lines from an API document (with product included) → editor lines. */
export function toEditLines(rows: any[]): EditLine[] {
  return rows.map((l) => ({
    key: newKey(),
    productId: l.productId,
    product: l.product,
    batchId: l.batchId ?? null,
    godownId: l.godownId ?? null,
    qtyPcs: l.qtyPcs,
    priceBasis: (l.priceBasis as EditLine["priceBasis"]) ?? "PER_UNIT",
    enteredRatePaise: Number(l.enteredRatePaise ?? l.ratePaise),
    discountPct: l.discountPct ?? 0,
    orderLineId: l.orderLineId ?? null,
  }));
}

export function linesPayload(lines: EditLine[]) {
  return lines
    .filter((l) => l.productId && l.qtyPcs > 0)
    .map((l) => ({
      productId: l.productId,
      batchId: l.batchId ?? null,
      godownId: l.godownId ?? null,
      qtyPcs: l.qtyPcs,
      priceBasis: l.priceBasis,
      enteredRatePaise: l.enteredRatePaise,
      discountPct: l.discountPct || 0,
      orderLineId: l.orderLineId ?? null,
    }));
}

export function DocMeta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[12px] text-muted-foreground">{label}</div>
      <div className="truncate font-medium">{children}</div>
    </div>
  );
}
