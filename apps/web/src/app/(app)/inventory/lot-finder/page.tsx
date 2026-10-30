"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FilePlus2, ShoppingBag } from "lucide-react";
import { formatDate, LOT_QTY_UNITS, type LotQtyUnit } from "@gc/shared";
import { PageHeader, Section } from "@/components/common/page-header";
import { EntitySelect } from "@/components/common/entity-select";
import { FieldShell, NativeSelect } from "@/components/common/form-fields";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LotCard, type LotRow } from "@/components/inventory-lots/lot-card";
import { useApi } from "@/lib/api";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

interface Prod {
  id: string;
  sku: string;
  name: string;
  uomType: string;
  unitName: string | null;
  pcsPerBox: number | null;
  sqftPerBox: number | null;
  brand: { name: string };
  size: { name: string } | null;
  finish: { name: string } | null;
}

interface LotFinderResult {
  product: Prod & { series: { name: string } | null };
  requiredPcs: number;
  requiredText: string;
  totalAvailableText: string;
  totalAvailablePcs: number;
  fittingLots: number;
  lots: LotRow[];
  lastDelivery: null | { batchNo: string | null; shadeCode: string | null; caliber: string | null; invoiceId: string; invoiceNo: string | null; date: string; inStockText: string; coversRequirement: boolean };
  alternatives: { product: Prod; sameSeries: boolean; lot: { batchNo: string; shadeCode: string; caliber: string; availableText: string; leftoverText: string } }[];
}

interface SiteHistory {
  product: Prod;
  shades: string[];
  mixedShades: boolean;
  totalText: string;
  deliveries: { invoiceId: string; invoiceNo: string; date: string; site: { name: string } | null; batchNo: string | null; shadeCode: string | null; caliber: string | null; qtyText: string }[];
}

const UNIT_LABEL: Record<LotQtyUnit, string> = { SQFT: "sq ft", BOXES: "boxes", PCS: "pcs / units" };

function useDebounced<T>(v: T, ms = 400) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

export default function LotFinderPage() {
  const { can } = useSession();
  const [productId, setProductId] = useState<string | null>(null);
  const [product, setProduct] = useState<Prod | null>(null);
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState<LotQtyUnit>("SQFT");
  const [wastage, setWastage] = useState("5");
  const [partyId, setPartyId] = useState<string | null>(null);
  const [siteId, setSiteId] = useState("");
  const tile = product ? product.uomType === "PIECE_BOX_AREA" : true;

  useEffect(() => {
    if (product && product.uomType !== "PIECE_BOX_AREA" && unit !== "PCS") setUnit("PCS");
  }, [product, unit]);

  const dQty = useDebounced(qty);
  const dWastage = useDebounced(wastage);
  const qtyNum = Number(dQty);
  const result = useApi<LotFinderResult>(productId && qtyNum > 0 ? "/stock/lot-finder" : null, {
    productId,
    qty: qtyNum,
    unit,
    wastagePct: unit === "SQFT" ? Number(dWastage) || 0 : 0,
    partyId: partyId ?? undefined,
    siteId: siteId || undefined,
  });
  const party = useApi<{ id: string; sites: { id: string; name: string }[] }>(partyId ? `/parties/${partyId}` : null);
  const history = useApi<SiteHistory[]>(partyId ? "/stock/site-history" : null, { partyId: partyId ?? undefined, siteId: siteId || undefined });

  const r = result.data;
  return (
    <>
      <PageHeader
        title="Shade lot finder"
        description="Tiles must go to a site from ONE shade lot. Enter what the customer needs to see which lot can supply all of it."
      />

      <Section>
        <div className="grid gap-4 md:grid-cols-[2fr_1.4fr_1fr]">
          <FieldShell label="Tile or item" required>
            <EntitySelect<Prod>
              endpoint="/products"
              value={productId}
              onChange={(id, item) => {
                setProductId(id);
                setProduct(item);
              }}
              getLabel={(p) => p.name}
              getDescription={(p) => [p.sku, p.size?.name, p.finish?.name, p.brand?.name].filter(Boolean).join(" · ")}
              placeholder="Search by name, SKU or size…"
              autoFocus
            />
          </FieldShell>
          <FieldShell label="Quantity needed" required>
            <div className="flex gap-2">
              <Input inputMode="decimal" type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" className="tabular" aria-label="Quantity" />
              <div className="inline-flex shrink-0 rounded-md bg-fill p-0.5" role="radiogroup" aria-label="Unit">
                {LOT_QTY_UNITS.filter((u) => tile || u === "PCS").map((u) => (
                  <button
                    key={u}
                    type="button"
                    role="radio"
                    aria-checked={unit === u}
                    onClick={() => setUnit(u)}
                    className={cn("rounded px-2.5 text-[12.5px] font-medium whitespace-nowrap", unit === u ? "bg-[var(--segment-on)] shadow-sm" : "text-muted-foreground")}
                  >
                    {UNIT_LABEL[u]}
                  </button>
                ))}
              </div>
            </div>
          </FieldShell>
          {unit === "SQFT" && (
            <FieldShell label="Wastage" hint="5% floor · 8% wall">
              <div className="relative">
                <Input inputMode="decimal" type="number" min={0} max={50} value={wastage} onChange={(e) => setWastage(e.target.value)} className="pr-8 tabular" aria-label="Wastage percent" />
                <span className="absolute top-1/2 right-3 -translate-y-1/2 text-[12px] text-muted-foreground">%</span>
              </div>
            </FieldShell>
          )}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <FieldShell label="Customer (optional)" hint="Shows the shade delivered last time so a repeat order matches">
            <EntitySelect
              endpoint="/parties"
              params={{ type: "CUSTOMER" }}
              value={partyId}
              onChange={(id) => {
                setPartyId(id);
                setSiteId("");
              }}
              getLabel={(p: { id: string; name: string }) => p.name}
              clearable
              placeholder="Pick a customer…"
            />
          </FieldShell>
          {!!party.data?.sites?.length && (
            <FieldShell label="Site">
              <NativeSelect value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                <option value="">All sites</option>
                {party.data.sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            </FieldShell>
          )}
        </div>
      </Section>

      <div className="mt-4 space-y-4">
        {!productId || !(qtyNum > 0) ? (
          <Section>
            <EmptyState title="Pick a tile and enter the quantity" description="For example 450 sq ft of a 600x600 tile with 5% wastage." />
          </Section>
        ) : result.isLoading ? (
          <Section>
            <LoadingRows rows={4} />
          </Section>
        ) : result.isError ? (
          <Section>
            <ErrorState error={result.error} retry={() => result.refetch()} />
          </Section>
        ) : r ? (
          <>
            <Section
              title={
                <span>
                  Need <span className="tabular">{r.requiredText}</span>
                </span>
              }
              actions={
                <div className="flex gap-2">
                  {can("quotation.write") && (
                    <Button asChild size="sm" variant="secondary">
                      <Link href="/sales/quotations/new">
                        <FilePlus2 className="size-4" /> New quotation
                      </Link>
                    </Button>
                  )}
                  {can("order.write") && (
                    <Button asChild size="sm">
                      <Link href="/sales/orders/new">
                        <ShoppingBag className="size-4" /> New order
                      </Link>
                    </Button>
                  )}
                </div>
              }
            >
              <p className="mb-3 text-[13px] text-muted-foreground">
                {r.product.name} · {r.product.sku}
                {r.product.size ? ` · ${r.product.size.name}` : ""} — {r.totalAvailableText} free across {r.lots.length} lot{r.lots.length === 1 ? "" : "s"}.{" "}
                {r.fittingLots ? (
                  <span className="font-medium text-ios-green">
                    {r.fittingLots} lot{r.fittingLots === 1 ? "" : "s"} can supply it all.
                  </span>
                ) : (
                  <span className="font-medium text-ios-red">No single lot can supply it all.</span>
                )}
              </p>
              {r.lastDelivery && (
                <div className={cn("mb-3 rounded-lg px-3 py-2 text-[13px]", r.lastDelivery.coversRequirement ? "bg-ios-indigo/10" : "bg-ios-orange/12")}>
                  Last delivery to this {siteId ? "site" : "customer"}: <span className="font-medium">shade {r.lastDelivery.shadeCode}</span> (lot {r.lastDelivery.batchNo}
                  {r.lastDelivery.caliber && r.lastDelivery.caliber !== "-" ? `, cal ${r.lastDelivery.caliber}` : ""}) on{" "}
                  <Link className="text-tint hover:underline" href={`/sales/invoices/${r.lastDelivery.invoiceId}`}>
                    {r.lastDelivery.invoiceNo}
                  </Link>{" "}
                  · {formatDate(r.lastDelivery.date)}.{" "}
                  {r.lastDelivery.coversRequirement
                    ? `Same shade in stock: ${r.lastDelivery.inStockText} — enough for this order.`
                    : `Same shade in stock: ${r.lastDelivery.inStockText} — not enough; agree a shade change with the customer.`}
                </div>
              )}
              {r.lots.length ? (
                <div className="grid gap-3 lg:grid-cols-2">
                  {r.lots.map((l, i) => (
                    <LotCard key={l.batchId} lot={l} product={r.product} best={i === 0 && l.fits} />
                  ))}
                </div>
              ) : (
                <EmptyState title="No stock of this product" className="py-6" />
              )}
            </Section>

            {r.alternatives.length > 0 && (
              <Section title="Same size and finish with one lot that covers it">
                <ul className="divide-y divide-border">
                  {r.alternatives.map((a) => (
                    <li key={a.product.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                      <div className="min-w-0">
                        <div className="font-medium">
                          {a.product.name}
                          {a.sameSeries && <span className="ml-2 rounded-full bg-ios-teal/14 px-2 py-0.5 text-[11px] text-ios-teal">Same series</span>}
                        </div>
                        <div className="text-[12.5px] text-muted-foreground">
                          {a.product.sku} · {a.product.brand.name} · shade {a.lot.shadeCode} · lot {a.lot.batchNo}
                        </div>
                      </div>
                      <div className="text-right text-[13px]">
                        <div className="font-medium tabular">{a.lot.availableText} free</div>
                        <div className="text-[12px] text-muted-foreground">leaves {a.lot.leftoverText}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </>
        ) : null}

        {partyId && (
          <Section title="Shades delivered to this customer">
            {history.isLoading ? (
              <LoadingRows rows={3} />
            ) : !history.data?.length ? (
              <EmptyState title="No deliveries yet" className="py-6" />
            ) : (
              <div className="space-y-4">
                {history.data.map((h) => (
                  <div key={h.product.id}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{h.product.name}</span>
                      <span className="text-[12.5px] text-muted-foreground">
                        {h.product.sku} · total {h.totalText}
                      </span>
                      {h.mixedShades && <span className="rounded-full bg-ios-orange/14 px-2 py-0.5 text-[11px] font-medium text-ios-orange">Mixed shades: {h.shades.join(", ")}</span>}
                    </div>
                    <div className="mt-1 overflow-x-auto">
                      <table className="w-full text-[13px]">
                        <tbody>
                          {h.deliveries.map((d, i) => (
                            <tr key={i} className="border-b border-border/60 last:border-0">
                              <td className="py-1.5 pr-3 whitespace-nowrap">{formatDate(d.date)}</td>
                              <td className="py-1.5 pr-3 whitespace-nowrap">
                                <Link className="text-tint hover:underline" href={`/sales/invoices/${d.invoiceId}`}>
                                  {d.invoiceNo}
                                </Link>
                              </td>
                              <td className="py-1.5 pr-3">{d.site?.name ?? "—"}</td>
                              <td className="py-1.5 pr-3 whitespace-nowrap">
                                {d.shadeCode && d.shadeCode !== "-" ? `Shade ${d.shadeCode} · lot ${d.batchNo}` : `Lot ${d.batchNo ?? "—"}`}
                              </td>
                              <td className="py-1.5 text-right whitespace-nowrap tabular">{d.qtyText}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}
      </div>
    </>
  );
}
