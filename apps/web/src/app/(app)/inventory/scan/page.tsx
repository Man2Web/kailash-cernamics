"use client";

import { useState } from "react";
import Link from "next/link";
import { labelOf } from "@gc/shared";
import { PageHeader, Section, InfoGrid } from "@/components/common/page-header";
import { ErrorState, EmptyState } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { ScanBox } from "@/components/inventory-ops/scanner";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/api";

interface Loc {
  godown?: { name: string };
  rack?: { code: string } | null;
  batch?: { batchNo: string; shadeCode: string; caliber: string; grade: string };
  stockType: string;
  qtyPcs: number;
  text: string;
}
type Result =
  | { kind: "BATCH"; product: any; batch: any; totals: any; locations: Loc[] }
  | { kind: "PRODUCT"; product: any; totals: any; locations: Loc[] }
  | { kind: "RACK"; rack: { code: string; name: string | null; godown: { name: string } }; items: (Loc & { product: any })[] };

export default function ScanPage() {
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const scan = async (code: string) => {
    setBusy(true);
    setError(null);
    try {
      setResult(await apiGet<Result>("/scan/resolve", { code }));
    } catch (e) {
      setResult(null);
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader title="Scan" description="Scan a box label, rack label or SKU to see what it is and where the stock sits." actions={<Button asChild size="sm" variant="secondary"><Link href="/inventory/labels">Print labels</Link></Button>} />
      <Section className="mb-4">
        <ScanBox onScan={scan} autoFocus />
      </Section>
      {busy ? (
        <Section>Looking up…</Section>
      ) : error ? (
        <Section><ErrorState error={error} /></Section>
      ) : !result ? (
        <Section><EmptyState title="Ready to scan" description="Point the scanner at a GC box or rack label, or type an SKU / batch number." /></Section>
      ) : result.kind === "RACK" ? (
        <Section title={`Rack ${result.rack.code} · ${result.rack.godown.name}`}>
          {result.items.length ? (
            <ul className="divide-y divide-border">
              {result.items.map((i, n) => (
                <li key={n} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{i.product.name}</div>
                    <div className="text-[12px] text-muted-foreground">
                      {i.product.sku} · shade {i.batch?.shadeCode} · {i.batch?.batchNo} · cal {i.batch?.caliber}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-medium tabular">{i.text}</div>
                    <StatusBadge status={i.stockType} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="This rack is empty" />
          )}
        </Section>
      ) : (
        <Section
          title={result.product.name}
          actions={
            <div className="flex gap-2">
              <Button asChild size="sm" variant="secondary"><Link href={`/inventory/stock/${result.product.id}`}>Stock detail</Link></Button>
              <Button asChild size="sm" variant="secondary"><Link href="/inventory/transfers/new">Transfer</Link></Button>
              <Button asChild size="sm" variant="secondary"><Link href="/inventory/breakage/new">Breakage</Link></Button>
            </div>
          }
        >
          <InfoGrid
            className="mb-4"
            items={[
              { label: "SKU", value: result.product.sku },
              { label: "Brand / size", value: `${result.product.brand?.name ?? ""} ${result.product.size?.name ?? ""}` },
              ...(result.kind === "BATCH"
                ? [
                    { label: "Shade · batch", value: `${result.batch.shadeCode} · ${result.batch.batchNo}` },
                    { label: "Caliber · grade", value: `${result.batch.caliber} · ${labelOf(result.batch.grade)}` },
                  ]
                : []),
              { label: "Available", value: result.totals.availableText },
            ]}
          />
          {result.locations.length ? (
            <ul className="divide-y divide-border">
              {result.locations.map((l, n) => (
                <li key={n} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-[13px]">
                    {l.godown?.name}
                    {l.rack ? ` · rack ${l.rack.code}` : ""}
                    {l.batch ? ` · shade ${l.batch.shadeCode}` : ""}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-medium tabular">{l.text}</span>
                    <StatusBadge status={l.stockType} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No stock in this branch" />
          )}
        </Section>
      )}
    </>
  );
}
