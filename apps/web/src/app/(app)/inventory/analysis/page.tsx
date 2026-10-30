"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { formatINR, formatIndian, labelOf, STOCK_ANALYSIS_GROUPS, type StockAnalysisGroup } from "@gc/shared";
import { PageHeader, Section } from "@/components/common/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { useApi } from "@/lib/api";
import { exportToExcel } from "@/lib/export";
import { cn } from "@/lib/utils";

interface Row {
  key: string;
  label: string;
  products: number;
  availablePcs: number;
  boxes: number;
  units: number;
  sqft: number;
  sqm: number;
  soldSqft90: number;
  soldUnits90: number;
  coverDays: number | null;
  valuePaise?: number;
}

interface Analysis {
  groupBy: StockAnalysisGroup;
  overlapping: boolean;
  rows: Row[];
  totals: { boxes: number; units: number; sqft: number; sqm: number; valuePaise?: number };
}

const GROUP_LABEL: Record<StockAnalysisGroup, string> = {
  size: "Size",
  finish: "Finish",
  application: "Application",
  brand: "Brand",
  category: "Category",
  godown: "Godown",
  grade: "Grade",
};

function coverTone(d: number | null) {
  if (d === null) return "text-muted-foreground";
  if (d < 20) return "text-ios-red font-medium";
  if (d > 180) return "text-ios-orange font-medium";
  return "";
}

/** Stock by size / finish / application / brand… with sales speed and days of cover. */
export default function StockAnalysisPage() {
  const [groupBy, setGroupBy] = useState<StockAnalysisGroup>("size");
  const [type, setType] = useState("TILE");
  const q = useApi<Analysis>("/stock/analysis", { groupBy, categoryType: type || undefined });
  const max = Math.max(1, ...(q.data?.rows ?? []).map((r) => (type === "TILE" ? r.sqft : r.units || r.sqft)));

  const doExport = () =>
    q.data &&
    exportToExcel(
      `stock-by-${groupBy}`,
      [
        { header: GROUP_LABEL[groupBy], key: "label", width: 24 },
        { header: "Products", key: "products" },
        { header: "Boxes", key: "boxes" },
        { header: "Units", key: "units" },
        { header: "Sq ft", key: "sqft" },
        { header: "Sq m", key: "sqm" },
        { header: "Sold sq ft (90 d)", key: "soldSqft90" },
        { header: "Cover days", key: "coverDays" },
        { header: "Value (₹)", key: "value" },
      ],
      q.data.rows.map((r) => ({ ...r, value: r.valuePaise !== undefined ? r.valuePaise / 100 : "" })),
    );

  return (
    <>
      <PageHeader
        title="Stock analysis"
        description="How much you hold by size, finish, application or brand, how fast it sells, and how many days it will last."
        actions={
          <Button variant="secondary" size="sm" onClick={doExport} disabled={!q.data?.rows.length}>
            <Download className="size-4" /> Excel
          </Button>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap gap-1 rounded-lg bg-fill p-1">
          {STOCK_ANALYSIS_GROUPS.map((g) => (
            <button
              key={g}
              onClick={() => setGroupBy(g)}
              className={cn("rounded-md px-3 py-1.5 text-[13px] font-medium", groupBy === g ? "bg-[var(--segment-on)] shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              {GROUP_LABEL[g]}
            </button>
          ))}
        </div>
        <select aria-label="Category type" value={type} onChange={(e) => setType(e.target.value)} className="h-9 rounded-md bg-fill px-2 text-[13px]">
          <option value="TILE">Tiles</option>
          <option value="SANITARY">Sanitary</option>
          <option value="CP_FITTING">CP fittings</option>
          <option value="">Everything</option>
        </select>
      </div>

      <Section>
        {q.isLoading ? (
          <LoadingRows />
        ) : q.isError ? (
          <ErrorState error={q.error} retry={() => q.refetch()} />
        ) : !q.data?.rows.length ? (
          <EmptyState title="No stock to analyse" />
        ) : (
          <>
            {q.data.overlapping && <p className="mb-2 text-[12.5px] text-muted-foreground">A tile used for several applications is counted in each, so rows add up to more than the total.</p>}
            <div className="overflow-x-auto">
              <table className="w-full text-[13.5px]">
                <thead>
                  <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
                    <th className="h-9 pr-3 font-medium">{GROUP_LABEL[groupBy]}</th>
                    <th className="h-9 pr-3 text-right font-medium">Products</th>
                    <th className="h-9 pr-3 text-right font-medium">{type === "TILE" ? "Boxes" : "Units"}</th>
                    {type !== "SANITARY" && type !== "CP_FITTING" && <th className="h-9 pr-3 text-right font-medium">Sq ft · sq m</th>}
                    <th className="hidden h-9 pr-3 font-medium md:table-cell">Share</th>
                    <th className="h-9 pr-3 text-right font-medium">Sold (90 d)</th>
                    <th className="h-9 pr-3 text-right font-medium">Cover</th>
                    {q.data.rows[0].valuePaise !== undefined && <th className="h-9 text-right font-medium">Value</th>}
                  </tr>
                </thead>
                <tbody>
                  {q.data.rows.map((r) => {
                    const measure = type === "TILE" ? r.sqft : r.units || r.sqft;
                    return (
                      <tr key={r.key} className="border-b border-border/60 last:border-0">
                        <td className="py-2 pr-3 font-medium">{groupBy === "application" || groupBy === "grade" ? labelOf(r.label) : r.label}</td>
                        <td className="py-2 pr-3 text-right tabular">{r.products}</td>
                        <td className="py-2 pr-3 text-right tabular">{formatIndian(type === "TILE" ? r.boxes : r.units || r.boxes, 0)}</td>
                        {type !== "SANITARY" && type !== "CP_FITTING" && (
                          <td className="py-2 pr-3 text-right whitespace-nowrap tabular">
                            {formatIndian(r.sqft, 0)} <span className="text-muted-foreground">· {formatIndian(r.sqm, 0)}</span>
                          </td>
                        )}
                        <td className="hidden w-48 py-2 pr-3 md:table-cell">
                          <div className="h-2 rounded-full bg-fill">
                            <div className="h-2 rounded-full bg-tint" style={{ width: `${Math.max(2, (measure / max) * 100)}%` }} />
                          </div>
                        </td>
                        <td className="py-2 pr-3 text-right whitespace-nowrap tabular">{r.soldSqft90 ? `${formatIndian(r.soldSqft90, 0)} sq ft` : r.soldUnits90 ? `${r.soldUnits90} units` : "—"}</td>
                        <td className={cn("py-2 pr-3 text-right whitespace-nowrap tabular", coverTone(r.coverDays))}>{r.coverDays === null ? "No sales" : `${r.coverDays} d`}</td>
                        {r.valuePaise !== undefined && <td className="py-2 text-right whitespace-nowrap tabular">{formatINR(r.valuePaise)}</td>}
                      </tr>
                    );
                  })}
                </tbody>
                {!q.data.overlapping && (
                  <tfoot>
                    <tr className="border-t border-border font-semibold">
                      <td className="py-2 pr-3">Total</td>
                      <td />
                      <td className="py-2 pr-3 text-right tabular">{formatIndian(type === "TILE" ? q.data.totals.boxes : q.data.totals.units || q.data.totals.boxes, 0)}</td>
                      {type !== "SANITARY" && type !== "CP_FITTING" && (
                        <td className="py-2 pr-3 text-right tabular">
                          {formatIndian(q.data.totals.sqft, 0)} <span className="font-normal text-muted-foreground">· {formatIndian(q.data.totals.sqm, 0)}</span>
                        </td>
                      )}
                      <td className="hidden md:table-cell" />
                      <td />
                      <td />
                      {q.data.totals.valuePaise !== undefined && <td className="py-2 text-right tabular">{formatINR(q.data.totals.valuePaise)}</td>}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <p className="mt-3 text-[12px] text-muted-foreground">Cover = days the free stock lasts at the last 90 days' sales speed. Red under 20 days, amber over 180 days.</p>
          </>
        )}
      </Section>
    </>
  );
}
