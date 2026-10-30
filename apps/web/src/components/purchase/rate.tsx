"use client";

import { formatINR, ratePerBoxToPerPiece, ratePerPieceToPerBox } from "@gc/shared";
import { MoneyInput } from "@/components/common/form-fields";
import { isTileProduct, type ProductLite } from "@/components/inventory/pickers";

/** Rate entry: per box for tiles (stored per piece), per unit for everything else. */
export function RateInput({ product, ratePaise, onChange }: { product: ProductLite | null; ratePaise: number; onChange: (perPiecePaise: number) => void }) {
  const tile = isTileProduct(product) && !!product?.pcsPerBox;
  const shown = tile ? ratePerPieceToPerBox(ratePaise, product!.pcsPerBox) : ratePaise;
  return (
    <div className="min-w-32">
      <MoneyInput value={shown} onChange={(v) => onChange(tile ? ratePerBoxToPerPiece(v, product!.pcsPerBox) : v)} />
      <div className="mt-0.5 text-[11px] text-muted-foreground">{tile ? `per box · ${formatINR(ratePaise)}/pc` : `per ${product?.unitName ?? "unit"}`}</div>
    </div>
  );
}

export function TotalsBox({ rows }: { rows: { label: string; value: React.ReactNode; strong?: boolean }[] }) {
  return (
    <dl className="ml-auto w-full max-w-sm space-y-1 text-[13.5px]">
      {rows.map((r) => (
        <div key={r.label} className={r.strong ? "flex justify-between border-t border-border pt-2 text-[15px] font-semibold" : "flex justify-between"}>
          <dt className={r.strong ? undefined : "text-muted-foreground"}>{r.label}</dt>
          <dd className="tabular">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
