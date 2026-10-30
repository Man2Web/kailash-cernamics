"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { formatINR } from "@gc/shared";
import { PageHeader, Section } from "@/components/common/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { EntitySelect } from "@/components/common/entity-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { api, useApi } from "@/lib/api";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

interface Item {
  product: { id: string; sku: string; name: string; uomType: string; unitName: string | null; pcsPerBox: number | null; size: { name: string } | null };
  availableText: string;
  onOrderText: string;
  soldText: string;
  dailyPcs: number;
  coverDays: number | null;
  leadTimeDays: number;
  safetyStockDays: number;
  suggestedPcs: number;
  suggestedText: string;
  reason: "BELOW_REORDER_LEVEL" | "COVER_BELOW_LEAD_TIME" | "OK";
  lastRatePaise?: number | null;
}

interface Group {
  brand: { id: string; name: string; leadTimeDays: number; supplier: { id: string; name: string } | null };
  items: Item[];
  suggestedCount: number;
}

const REASON: Record<Item["reason"], { label: string; tone: string }> = {
  BELOW_REORDER_LEVEL: { label: "Below reorder level", tone: "bg-ios-red/12 text-ios-red" },
  COVER_BELOW_LEAD_TIME: { label: "Runs out before next delivery", tone: "bg-ios-orange/14 text-ios-orange" },
  OK: { label: "Covered", tone: "bg-fill text-muted-foreground" },
};

const tileOf = (p: Item["product"]) => p.uomType === "PIECE_BOX_AREA" && !!p.pcsPerBox;

function BrandGroup({ g, windowDays }: { g: Group; windowDays: number }) {
  const { can } = useSession();
  const [supplierId, setSupplierId] = useState<string | null>(g.brand.supplier?.id ?? null);
  // quantity in boxes for tiles, units otherwise
  const [qty, setQty] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ id: string; number: string } | null>(null);

  useEffect(() => {
    const q: Record<string, string> = {};
    const p: Record<string, boolean> = {};
    for (const i of g.items) {
      const n = tileOf(i.product) ? i.suggestedPcs / i.product.pcsPerBox! : i.suggestedPcs;
      q[i.product.id] = n ? String(Math.ceil(n)) : "";
      p[i.product.id] = i.suggestedPcs > 0;
    }
    setQty(q);
    setPicked(p);
  }, [g]);

  const lines = g.items
    .filter((i) => picked[i.product.id] && Number(qty[i.product.id]) > 0)
    .map((i) => ({ productId: i.product.id, qtyPcs: Math.round(Number(qty[i.product.id]) * (tileOf(i.product) ? i.product.pcsPerBox! : 1)) }));

  const createPo = async () => {
    if (!supplierId) return toast.error("Pick the supplier for this brand");
    setBusy(true);
    try {
      const res = await api<{ id: string; number: string; ratesMissing: number }>("/stock/reorder/purchase-order", { method: "POST", body: { supplierId, brandId: g.brand.id, lines } });
      setCreated(res);
      toast.success(`Draft ${res.number} created${res.ratesMissing ? ` — enter rates for ${res.ratesMissing} item(s)` : ""}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the purchase order");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title={
        <span>
          {g.brand.name} <span className="text-[13px] font-normal text-muted-foreground">· lead time {g.brand.leadTimeDays} days</span>
        </span>
      }
      actions={
        created ? (
          <Button asChild size="sm" variant="secondary">
            <Link href={`/purchase/orders/${created.id}`}>Open {created.number}</Link>
          </Button>
        ) : null
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
              <th className="h-9 w-8" />
              <th className="h-9 pr-3 font-medium">Product</th>
              <th className="h-9 pr-3 text-right font-medium">Free stock</th>
              <th className="h-9 pr-3 text-right font-medium">On order</th>
              <th className="h-9 pr-3 text-right font-medium">Sold ({windowDays} d)</th>
              <th className="h-9 pr-3 text-right font-medium">Cover</th>
              <th className="h-9 pr-3 font-medium">Why</th>
              <th className="h-9 text-right font-medium">Order</th>
            </tr>
          </thead>
          <tbody>
            {g.items.map((i) => {
              const tile = tileOf(i.product);
              return (
                <tr key={i.product.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2">
                    <Checkbox
                      checked={!!picked[i.product.id]}
                      onCheckedChange={(v) => setPicked((p) => ({ ...p, [i.product.id]: !!v }))}
                      aria-label={`Order ${i.product.name}`}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <div className="font-medium">{i.product.name}</div>
                    <div className="text-[12px] text-muted-foreground">
                      {i.product.sku}
                      {i.product.size ? ` · ${i.product.size.name}` : ""}
                      {i.lastRatePaise ? ` · last rate ${formatINR(tile ? i.lastRatePaise * i.product.pcsPerBox! : i.lastRatePaise)}${tile ? "/box" : ""}` : ""}
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap">{i.availableText}</td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap text-muted-foreground">{i.onOrderText}</td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap">{i.soldText}</td>
                  <td className={cn("py-2 pr-3 text-right whitespace-nowrap tabular", i.coverDays !== null && i.coverDays < i.leadTimeDays && "font-medium text-ios-red")}>
                    {i.coverDays === null ? "—" : `${i.coverDays} d`}
                  </td>
                  <td className="py-2 pr-3">
                    <span className={cn("inline-flex h-5 items-center rounded-full px-2 text-[11.5px] font-medium whitespace-nowrap", REASON[i.reason].tone)}>{REASON[i.reason].label}</span>
                  </td>
                  <td className="py-2 text-right">
                    <div className="ml-auto flex w-32 items-center justify-end gap-1.5">
                      <Input
                        inputMode="numeric"
                        type="number"
                        min={0}
                        value={qty[i.product.id] ?? ""}
                        onChange={(e) => setQty((q) => ({ ...q, [i.product.id]: e.target.value }))}
                        className="h-8 w-20 text-right tabular"
                        aria-label={`Quantity for ${i.product.name}`}
                      />
                      <span className="w-8 text-left text-[12px] text-muted-foreground">{tile ? "box" : i.product.unitName ?? "nos"}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {can("purchase.write") && (
        <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3 md:flex-row md:items-center md:justify-end">
          <div className="md:w-72">
            <EntitySelect
              endpoint="/parties"
              params={{ type: "SUPPLIER" }}
              value={supplierId}
              onChange={(id) => setSupplierId(id)}
              getLabel={(p: { id: string; name: string }) => p.name}
              placeholder="Supplier for this order…"
            />
          </div>
          <Button onClick={createPo} disabled={busy || !lines.length || !!created}>
            <ShoppingCart className="size-4" /> {created ? "Draft created" : `Create draft PO (${lines.length})`}
          </Button>
        </div>
      )}
    </Section>
  );
}

/** Reorder planner: sales speed + lead time + safety days → what to order, per brand → draft PO. */
export default function ReorderPage() {
  const [brandId, setBrandId] = useState<string | null>(null);
  const [windowDays, setWindowDays] = useState(90);
  const [showAll, setShowAll] = useState(false);
  const q = useApi<Group[]>("/stock/reorder", { brandId: brandId ?? undefined, windowDays, onlyNeeded: showAll ? "false" : "true" });
  const count = useMemo(() => (q.data ?? []).reduce((a, g) => a + g.suggestedCount, 0), [q.data]);

  return (
    <>
      <PageHeader
        title="Reorder planner"
        description="Suggested quantities cover the brand's lead time twice plus safety days at the recent sales speed, rounded to full boxes. Stock already on order is counted."
      />
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center">
        <div className="md:w-64">
          <EntitySelect endpoint="/brands" value={brandId} onChange={(id) => setBrandId(id)} getLabel={(b: { id: string; name: string }) => b.name} clearable placeholder="All brands" />
        </div>
        <select aria-label="Sales period" value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))} className="h-9 rounded-md bg-fill px-2 text-[13px]">
          <option value={30}>Sales speed: last 30 days</option>
          <option value={60}>Last 60 days</option>
          <option value={90}>Last 90 days</option>
          <option value={180}>Last 180 days</option>
        </select>
        <label className="flex items-center gap-2 text-[13px]">
          <Checkbox checked={showAll} onCheckedChange={(v) => setShowAll(!!v)} /> Show covered products too
        </label>
        {q.data && <span className="text-[13px] text-muted-foreground md:ml-auto">{count} product(s) to order</span>}
      </div>
      <div className="space-y-4">
        {q.isLoading ? (
          <Section>
            <LoadingRows />
          </Section>
        ) : q.isError ? (
          <Section>
            <ErrorState error={q.error} retry={() => q.refetch()} />
          </Section>
        ) : !q.data?.length ? (
          <Section>
            <EmptyState title="Nothing to reorder" description="Every product has enough stock and open orders to last its lead time." />
          </Section>
        ) : (
          q.data.map((g) => <BrandGroup key={g.brand.id} g={g} windowDays={windowDays} />)
        )}
      </div>
      <p className="mt-3 text-[12px] text-muted-foreground">Tip: set each brand&apos;s lead time and preferred supplier in Brands &amp; masters, and per-product lead/safety days on the product.</p>
    </>
  );
}
