"use client";

import Link from "next/link";
import { use } from "react";
import { formatINR, formatQty, labelOf } from "@gc/shared";
import { InfoGrid, PageHeader, Section } from "@/components/common/page-header";
import { EmptyState, ErrorState, LoadingPage } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { useApi } from "@/lib/api";
import { useSession } from "@/lib/session";

interface Totals {
  saleable: number;
  reserved: number;
  display: number;
  damaged: number;
  available: number;
}

interface Detail {
  product: { id: string; sku: string; name: string; uomType: string; unitName: string | null; pcsPerBox: number | null; sqftPerBox: number | null; reorderLevelPcs: number; brand: { name: string }; size: { name: string } | null; hsn: string };
  totals: Totals & { availableText: string; availableArea?: string | null; inTransit?: number; sample?: number };
  batches: {
    batch: { id: string; batchNo: string; shadeCode: string; caliber: string; grade: string; landedCostPaise?: number; createdAt: string };
    totals: Totals;
    availableText: string;
    availableArea?: string | null;
    locations: { godown: { name: string }; rack: { code: string } | null; stockType: string; qtyPcs: number; text: string; areaText?: string | null }[];
  }[];
}

export default function StockProductPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = use(params);
  const { can } = useSession();
  const q = useApi<Detail>(`/stock/products/${productId}`);
  if (q.isLoading) return <LoadingPage />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const { product: p, totals, batches } = q.data;
  const fmt = (n: number) => (n ? formatQty(n, p) : "—");
  return (
    <>
      <PageHeader
        title={p.name}
        description={`${p.sku} · ${p.brand?.name}${p.size ? ` · ${p.size.name}` : ""}`}
        back={{ href: "/inventory/stock", label: "Stock" }}
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link href={`/inventory/ledger?productId=${p.id}`}>Stock ledger</Link>
          </Button>
        }
      />
      <Section className="mb-4">
        <InfoGrid
          items={[
            { label: "Available", value: totals.availableArea ? `${totals.availableText.split(" (")[0]} · ${totals.availableArea}` : totals.availableText },
            { label: "Saleable", value: fmt(totals.saleable) },
            { label: "Reserved", value: fmt(totals.reserved) },
            { label: "Display (showroom)", value: fmt(totals.display) },
            { label: "Damaged", value: fmt(totals.damaged) },
            ...(totals.inTransit ? [{ label: "In transit (arriving)", value: fmt(totals.inTransit) }] : []),
            ...(totals.sample ? [{ label: "Samples out", value: fmt(totals.sample) }] : []),
            { label: "Reorder level", value: p.reorderLevelPcs ? formatQty(p.reorderLevelPcs, p) : "Not set" },
            { label: "Shades / batches", value: batches.length },
            { label: "HSN", value: p.hsn },
          ]}
        />
      </Section>
      <Section title="By shade / batch">
        {!batches.length ? (
          <EmptyState title="No stock" description="Receive goods with a GRN to add stock." />
        ) : (
          <div className="space-y-3">
            {batches.map((b) => (
              <div key={b.batch.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold">
                      {b.batch.batchNo === "DEFAULT" ? "Stock" : `Shade ${b.batch.shadeCode}`}
                      {b.batch.batchNo !== "DEFAULT" && <span className="ml-2 text-[12px] font-normal text-muted-foreground">Batch {b.batch.batchNo} · Caliber {b.batch.caliber} · {labelOf(b.batch.grade)}</span>}
                    </div>
                    {can("cost.read") && b.batch.landedCostPaise !== undefined && <div className="text-[12px] text-muted-foreground">Landed cost {formatINR(b.batch.landedCostPaise)} / pc</div>}
                  </div>
                  <div className="text-right">
                    <div className="font-semibold tabular">{b.availableText}</div>
                    {b.availableArea && <div className="text-[11px] text-muted-foreground tabular">{b.availableArea}</div>}
                    <div className="text-[12px] text-muted-foreground">available</div>
                  </div>
                </div>
                <ul className="mt-2 divide-y divide-border/60 text-[13px]">
                  {b.locations.map((l, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 py-1.5">
                      <span>
                        {l.godown.name}
                        {l.rack ? ` · Rack ${l.rack.code}` : ""}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="tabular">{l.text}</span>
                        <StatusBadge status={l.stockType} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
