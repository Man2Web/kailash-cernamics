"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import {
  AREA_TYPES,
  formatINR,
  labelOf,
  salesAreaQty,
  salesAreaSqft,
  salesDefaultWastage,
  salesDocTotals,
  salesLineAmounts,
  stateName,
  toDateInput,
} from "@gc/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Section } from "@/components/common/page-header";
import { FieldShell, MoneyInput, NativeSelect } from "@/components/common/form-fields";
import { EntitySelect } from "@/components/common/entity-select";
import { useDraft, useFormKeys } from "@/hooks/use-form-keys";
import { api } from "@/lib/api";
import {
  BasisSelect,
  CustomerFields,
  emptyLine,
  fetchPrice,
  fmtQty,
  LinesEditor,
  linesPayload,
  newKey,
  productDescription,
  productLabel,
  TotalsPanel,
  useInterState,
  useParty,
  type EditLine,
  type ProductLite,
} from "./sales-kit";

export interface QArea {
  key: string;
  areaType: (typeof AREA_TYPES)[number];
  wastagePct: number | null;
  areaSqft: number | null;
  productId: string | null;
  product: ProductLite | null;
  priceBasis: EditLine["priceBasis"];
  enteredRatePaise: number;
  discountPct: number;
}

export interface QRoom {
  key: string;
  name: string;
  lengthFt: number;
  widthFt: number;
  heightFt: number | null;
  deductionsSqft: number;
  areas: QArea[];
}

export interface QuoteValues {
  partyId: string | null;
  customerName: string;
  customerPhone: string;
  siteId: string | null;
  influencerId: string | null;
  date: string;
  notes: string;
  transportPaise: number;
  loadingPaise: number;
  rooms: QRoom[];
  items: EditLine[];
}

const newArea = (areaType: QArea["areaType"] = "FLOOR"): QArea => ({
  key: newKey(),
  areaType,
  wastagePct: null,
  areaSqft: null,
  productId: null,
  product: null,
  priceBasis: "PER_SQFT",
  enteredRatePaise: 0,
  discountPct: 0,
});

const newRoom = (n: number): QRoom => ({ key: newKey(), name: n === 1 ? "Living room" : `Room ${n}`, lengthFt: 0, widthFt: 0, heightFt: null, deductionsSqft: 0, areas: [newArea("FLOOR")] });

export function emptyQuote(): QuoteValues {
  return { partyId: null, customerName: "", customerPhone: "", siteId: null, influencerId: null, date: toDateInput(new Date()), notes: "", transportPaise: 0, loadingPaise: 0, rooms: [newRoom(1)], items: [] };
}

/** Stored quotation → builder values. */
export function quoteToValues(q: any): QuoteValues {
  return {
    partyId: q.partyId,
    customerName: q.customerName ?? "",
    customerPhone: q.customerPhone ?? "",
    siteId: q.siteId,
    influencerId: q.influencerId,
    date: toDateInput(q.date),
    notes: q.notes ?? "",
    transportPaise: Number(q.transportPaise),
    loadingPaise: Number(q.loadingPaise),
    rooms: q.rooms.map((r: any) => ({
      key: newKey(),
      name: r.name,
      lengthFt: r.lengthFt,
      widthFt: r.widthFt,
      heightFt: r.heightFt,
      deductionsSqft: r.deductionsSqft,
      areas: r.areas.flatMap((a: any) =>
        a.lines.map((l: any) => ({
          key: newKey(),
          areaType: a.areaType,
          wastagePct: a.wastagePct,
          areaSqft: a.areaType === "HIGHLIGHTER" ? a.areaSqft : null,
          productId: l.productId,
          product: l.product,
          priceBasis: l.priceBasis,
          enteredRatePaise: Number(l.enteredRatePaise),
          discountPct: l.discountPct,
        })),
      ),
    })),
    items: q.lines.map((l: any) => ({
      key: newKey(),
      productId: l.productId,
      product: l.product,
      qtyPcs: l.qtyPcs,
      priceBasis: l.priceBasis,
      enteredRatePaise: Number(l.enteredRatePaise),
      discountPct: l.discountPct,
    })),
  };
}

function num(v: string) {
  const n = Number(v.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Room-wise quotation builder: rooms → floor/wall/skirting/highlighter areas → tile per area with
 * live boxes "12 box + 3 pcs (155.0 sq ft)", rate basis, discount; extra items; live GST totals.
 */
export function QuoteBuilder({ initial, quoteId, readOnly }: { initial: QuoteValues; quoteId?: string; readOnly?: boolean }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [v, setV] = useState<QuoteValues>(initial);
  const [saving, setSaving] = useState(false);
  const party = useParty(v.partyId);
  const { interState, placeOfSupply } = useInterState(party.data);
  const draft = useDraft(quoteId || readOnly ? null : "sales-quotation", v);
  const restored = !quoteId && !readOnly ? draft.load() : null;

  const setRoom = (key: string, patch: Partial<QRoom>) => setV((s) => ({ ...s, rooms: s.rooms.map((r) => (r.key === key ? { ...r, ...patch } : r)) }));
  const setArea = (rk: string, ak: string, patch: Partial<QArea>) =>
    setV((s) => ({ ...s, rooms: s.rooms.map((r) => (r.key === rk ? { ...r, areas: r.areas.map((a) => (a.key === ak ? { ...a, ...patch } : a)) } : r)) }));

  const calc = useMemo(() => {
    const areaRows = v.rooms.flatMap((r) =>
      r.areas.map((a) => {
        const sqft = salesAreaSqft(r, a.areaType, a.areaSqft);
        const wastage = a.wastagePct ?? salesDefaultWastage(a.areaType);
        const qty = a.product ? salesAreaQty(a.product, sqft, wastage) : { qtyPcs: 0, boxes: 0, loosePcs: 0 };
        return { room: r, area: a, sqft, wastage, qty };
      }),
    );
    const lines = [
      ...areaRows.filter((x) => x.area.product && x.qty.qtyPcs > 0).map((x) => ({ product: x.area.product!, line: { qtyPcs: x.qty.qtyPcs, priceBasis: x.area.priceBasis, enteredRatePaise: x.area.enteredRatePaise, discountPct: x.area.discountPct } })),
      ...v.items.filter((l) => l.product && l.qtyPcs > 0).map((l) => ({ product: l.product!, line: l })),
    ];
    return { areaRows, totals: salesDocTotals(lines, interState, v.transportPaise + v.loadingPaise, 18) };
  }, [v, interState]);

  const pickAreaProduct = async (rk: string, ak: string, p: ProductLite | null) => {
    setArea(rk, ak, { productId: p?.id ?? null, product: p, priceBasis: "PER_SQFT", enteredRatePaise: 0 });
    if (!p) return;
    try {
      const price = await fetchPrice(p.id, v.partyId);
      setArea(rk, ak, { priceBasis: price.priceBasis, enteredRatePaise: price.pricePaise });
    } catch {
      /* ignore */
    }
  };

  const save = async () => {
    if (readOnly) return;
    if (!v.partyId && !v.customerName.trim()) return toast.error("Pick a customer or type the customer's name");
    setSaving(true);
    try {
      const body = {
        partyId: v.partyId,
        customerName: v.customerName || null,
        customerPhone: v.customerPhone || null,
        siteId: v.siteId,
        influencerId: v.influencerId,
        date: v.date ? new Date(`${v.date}T12:00:00+05:30`) : undefined,
        notes: v.notes || null,
        transportPaise: v.transportPaise,
        loadingPaise: v.loadingPaise,
        rooms: v.rooms
          .map((r) => ({
            name: r.name,
            lengthFt: r.lengthFt,
            widthFt: r.widthFt,
            heightFt: r.heightFt,
            deductionsSqft: r.deductionsSqft,
            areas: r.areas
              .filter((a) => a.productId)
              .map((a) => ({ areaType: a.areaType, wastagePct: a.wastagePct, areaSqft: a.areaSqft, productId: a.productId, priceBasis: a.priceBasis, enteredRatePaise: a.enteredRatePaise, discountPct: a.discountPct })),
          }))
          .filter((r) => r.areas.length),
        items: linesPayload(v.items).map(({ productId, qtyPcs, priceBasis, enteredRatePaise, discountPct }) => ({ productId, qtyPcs, priceBasis, enteredRatePaise, discountPct })),
      };
      const saved = await api<{ id: string; number: string }>(quoteId ? `/quotations/${quoteId}` : "/quotations", { method: quoteId ? "PATCH" : "POST", body });
      draft.clear();
      qc.invalidateQueries();
      toast.success(`Quotation ${saved.number} saved`);
      if (!quoteId) router.push(`/sales/quotations/${saved.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };
  const ref = useFormKeys<HTMLFormElement>(save);

  return (
    <form ref={ref} onSubmit={(e) => (e.preventDefault(), save())} className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <fieldset disabled={readOnly} className="min-w-0 space-y-4">
        {restored && v.rooms.every((r) => r.areas.every((a) => !a.productId)) && (
          <div className="flex items-center justify-between rounded-lg bg-ios-blue/10 px-3 py-2 text-[13px]">
            <span>You have an unsaved quotation draft.</span>
            <Button type="button" size="sm" variant="secondary" onClick={() => setV(restored)}>
              Restore
            </Button>
          </div>
        )}
        <Section>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <CustomerFields partyId={v.partyId} siteId={v.siteId} influencerId={v.influencerId} disabled={readOnly} onChange={(c) => setV((s) => ({ ...s, ...c }))} />
            {!v.partyId && (
              <>
                <FieldShell label="Walk-in customer name">
                  <Input value={v.customerName} onChange={(e) => setV((s) => ({ ...s, customerName: e.target.value }))} placeholder="If not a saved customer" />
                </FieldShell>
                <FieldShell label="Phone (for WhatsApp)">
                  <Input inputMode="tel" value={v.customerPhone} onChange={(e) => setV((s) => ({ ...s, customerPhone: e.target.value }))} />
                </FieldShell>
              </>
            )}
            <FieldShell label="Date" hint={`Place of supply: ${stateName(placeOfSupply)} (${interState ? "IGST" : "CGST + SGST"})`}>
              <Input type="date" value={v.date} onChange={(e) => setV((s) => ({ ...s, date: e.target.value }))} />
            </FieldShell>
          </div>
        </Section>

        {v.rooms.map((room, ri) => (
          <Section
            key={room.key}
            title={
              <Input
                aria-label="Room name"
                className="h-8 w-56 font-semibold"
                value={room.name}
                onChange={(e) => setRoom(room.key, { name: e.target.value })}
              />
            }
            actions={
              !readOnly && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setV((s) => ({ ...s, rooms: s.rooms.filter((r) => r.key !== room.key) }))}>
                  <Trash2 className="size-4" /> Remove room
                </Button>
              )
            }
          >
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <FieldShell label="Length (ft)">
                <Input inputMode="decimal" className="tabular" value={room.lengthFt || ""} onChange={(e) => setRoom(room.key, { lengthFt: num(e.target.value) })} autoFocus={ri > 0 && !room.lengthFt} />
              </FieldShell>
              <FieldShell label="Width (ft)">
                <Input inputMode="decimal" className="tabular" value={room.widthFt || ""} onChange={(e) => setRoom(room.key, { widthFt: num(e.target.value) })} />
              </FieldShell>
              <FieldShell label="Height (ft)" hint="For wall tiles">
                <Input inputMode="decimal" className="tabular" value={room.heightFt ?? ""} onChange={(e) => setRoom(room.key, { heightFt: e.target.value === "" ? null : num(e.target.value) })} />
              </FieldShell>
              <FieldShell label="Doors/windows (sq ft)" hint="Deducted from wall">
                <Input inputMode="decimal" className="tabular" value={room.deductionsSqft || ""} onChange={(e) => setRoom(room.key, { deductionsSqft: num(e.target.value) })} />
              </FieldShell>
            </div>
            <div className="mt-4 space-y-3">
              {room.areas.map((a) => {
                const row = calc.areaRows.find((x) => x.area.key === a.key)!;
                const amt = a.product && row.qty.qtyPcs ? salesLineAmounts(a.product, { qtyPcs: row.qty.qtyPcs, priceBasis: a.priceBasis, enteredRatePaise: a.enteredRatePaise, discountPct: a.discountPct }, interState) : null;
                return (
                  <div key={a.key} className="rounded-lg bg-fill/60 p-3">
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-[120px_1fr_90px_90px] md:items-end">
                      <FieldShell label="Area">
                        <NativeSelect value={a.areaType} onChange={(e) => setArea(room.key, a.key, { areaType: e.target.value as QArea["areaType"] })}>
                          {AREA_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {labelOf(t)}
                            </option>
                          ))}
                        </NativeSelect>
                      </FieldShell>
                      <FieldShell label="Tile" className="col-span-2 md:col-span-1">
                        <EntitySelect<ProductLite>
                          endpoint="/products"
                          params={{ uomType: "PIECE_BOX_AREA" }}
                          value={a.productId}
                          disabled={readOnly}
                          onChange={(_id, p) => pickAreaProduct(room.key, a.key, p)}
                          getLabel={productLabel}
                          getDescription={productDescription}
                          placeholder="Search tile…"
                        />
                      </FieldShell>
                      <FieldShell label="Wastage %">
                        <Input
                          inputMode="decimal"
                          className="tabular"
                          value={a.wastagePct ?? ""}
                          placeholder={String(row.wastage)}
                          onChange={(e) => setArea(room.key, a.key, { wastagePct: e.target.value === "" ? null : num(e.target.value) })}
                        />
                      </FieldShell>
                      <FieldShell label={a.areaType === "HIGHLIGHTER" ? "Area (sq ft)" : "Override sq ft"}>
                        <Input
                          inputMode="decimal"
                          className="tabular"
                          value={a.areaSqft ?? ""}
                          placeholder={row.sqft ? row.sqft.toFixed(1) : ""}
                          onChange={(e) => setArea(room.key, a.key, { areaSqft: e.target.value === "" ? null : num(e.target.value) })}
                        />
                      </FieldShell>
                    </div>
                    <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
                      <div className="text-[13px]">
                        <span className="text-muted-foreground">Area </span>
                        <span className="font-medium tabular">{row.sqft.toFixed(1)} sq ft</span>
                        {a.product && (
                          <>
                            <span className="text-muted-foreground"> · need </span>
                            <span className="font-semibold tabular text-tint">{fmtQty(row.qty.qtyPcs, a.product)}</span>
                          </>
                        )}
                      </div>
                      <div className="flex items-end gap-2">
                        <FieldShell label="Rate">
                          <div className="flex items-center gap-1">
                            <MoneyInput className="w-28" value={a.enteredRatePaise} disabled={readOnly} onChange={(p) => setArea(room.key, a.key, { enteredRatePaise: p })} />
                            <BasisSelect product={a.product} value={a.priceBasis} disabled={readOnly} onChange={(b) => setArea(room.key, a.key, { priceBasis: b })} />
                          </div>
                        </FieldShell>
                        <FieldShell label="Disc %">
                          <Input inputMode="decimal" className="h-9 w-16 tabular" value={a.discountPct || ""} onChange={(e) => setArea(room.key, a.key, { discountPct: Math.min(100, num(e.target.value)) })} />
                        </FieldShell>
                        <div className="w-28 pb-2 text-right font-medium tabular">{amt ? formatINR(amt.taxablePaise) : "—"}</div>
                        {!readOnly && (
                          <Button type="button" variant="ghost" size="icon" className="mb-1 size-8" aria-label="Remove area" onClick={() => setRoom(room.key, { areas: room.areas.filter((x) => x.key !== a.key) })}>
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {!readOnly && (
                <div className="flex flex-wrap gap-2">
                  {AREA_TYPES.map((t) => (
                    <Button key={t} type="button" variant="secondary" size="sm" onClick={() => setRoom(room.key, { areas: [...room.areas, newArea(t)] })}>
                      <Plus className="size-4" /> {labelOf(t)}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </Section>
        ))}
        {!readOnly && (
          <Button type="button" variant="secondary" onClick={() => setV((s) => ({ ...s, rooms: [...s.rooms, newRoom(s.rooms.length + 1)] }))}>
            <Plus className="size-4" /> Add room
          </Button>
        )}

        <Section title="Other items (sanitary, CP fittings, adhesives…)">
          {v.items.length ? (
            <LinesEditor lines={v.items} setLines={(fn) => setV((s) => ({ ...s, items: fn(s.items) }))} partyId={v.partyId} interState={interState} showBatch={false} disabled={readOnly} />
          ) : (
            !readOnly && (
              <Button type="button" variant="secondary" size="sm" onClick={() => setV((s) => ({ ...s, items: [emptyLine()] }))}>
                <Plus className="size-4" /> Add item
              </Button>
            )
          )}
        </Section>

        <Section>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <FieldShell label="Transport">
              <MoneyInput value={v.transportPaise} disabled={readOnly} onChange={(p) => setV((s) => ({ ...s, transportPaise: p }))} />
            </FieldShell>
            <FieldShell label="Loading / unloading">
              <MoneyInput value={v.loadingPaise} disabled={readOnly} onChange={(p) => setV((s) => ({ ...s, loadingPaise: p }))} />
            </FieldShell>
            <FieldShell label="Notes / terms" className="md:col-span-3">
              <Textarea rows={2} value={v.notes} onChange={(e) => setV((s) => ({ ...s, notes: e.target.value }))} />
            </FieldShell>
          </div>
        </Section>
      </fieldset>
      <div className="space-y-3 lg:sticky lg:top-20 lg:self-start">
        <TotalsPanel t={{ ...calc.totals, chargesPaise: v.transportPaise + v.loadingPaise }} interState={interState} />
        {!readOnly && (
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? "Saving…" : quoteId ? "Save changes (Ctrl+S)" : "Save quotation (Ctrl+S)"}
          </Button>
        )}
      </div>
    </form>
  );
}
