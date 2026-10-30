"use client";

import { AlertTriangle, CheckCircle2, History, XCircle } from "lucide-react";
import { formatBoxes, labelOf, piecesToSqft } from "@gc/shared";
import { cn } from "@/lib/utils";

export interface LotRow {
  batchId: string;
  batchNo: string;
  shadeCode: string;
  caliber: string;
  grade: string;
  variant?: { skuSuffix: string; name: string | null } | null;
  availablePcs: number;
  availableText: string;
  ageDays: number;
  fits: boolean;
  shortPcs: number;
  shortText: string | null;
  leftoverPcs: number;
  leftoverText: string | null;
  oddLeftover: boolean;
  sameAsLastDelivery: boolean;
  godowns: { godownId: string; name: string; availablePcs: number }[];
}

export interface UnitProduct {
  uomType: string;
  unitName: string | null;
  pcsPerBox: number | null;
  sqftPerBox: number | null;
}

/** "Shade S1A · Lot OB26150 · Cal C2 · Premium — 52 box free (806 sq ft) ✓ covers it, leaves 3 box" */
export function LotCard({ lot, product, best }: { lot: LotRow; product: UnitProduct; best?: boolean }) {
  const tile = product.uomType === "PIECE_BOX_AREA";
  return (
    <div
      className={cn(
        "rounded-xl border p-3 md:p-4",
        lot.fits ? "border-ios-green/40 bg-ios-green/[0.06]" : "border-ios-red/30 bg-ios-red/[0.04]",
        best && "ring-2 ring-ios-green/50",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold">
            {tile ? <>Shade {lot.shadeCode}</> : lot.variant ? <>{lot.variant.name ?? lot.variant.skuSuffix}</> : <>Lot {lot.batchNo}</>}
            <span className="font-normal text-muted-foreground">
              {" "}
              · Lot {lot.batchNo}
              {tile && lot.caliber !== "-" ? ` · Cal ${lot.caliber}` : ""} · {labelOf(lot.grade)}
            </span>
          </div>
          <div className="mt-0.5 text-[13.5px]">
            <span className="font-medium tabular">{lot.availableText}</span> free
            {lot.ageDays > 0 && <span className="text-muted-foreground"> · in stock {lot.ageDays} days</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {best && <span className="rounded-full bg-ios-green px-2 py-0.5 text-[11px] font-semibold text-white">Best pick</span>}
          {lot.sameAsLastDelivery && (
            <span className="inline-flex items-center gap-1 rounded-full bg-ios-indigo/14 px-2 py-0.5 text-[11px] font-semibold text-ios-indigo">
              <History className="size-3" /> Same shade as last delivery
            </span>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[13px]">
        {lot.fits ? (
          <>
            <CheckCircle2 className="size-4 text-ios-green" />
            <span>
              Covers the whole order{lot.leftoverPcs > 0 ? <>, leaves {lot.leftoverText}</> : " exactly"}
            </span>
          </>
        ) : (
          <>
            <XCircle className="size-4 text-ios-red" />
            <span>
              Short by <span className="font-medium">{lot.shortText}</span> — splitting shades is not recommended
            </span>
          </>
        )}
      </div>
      {lot.oddLeftover && (
        <div className="mt-1 flex items-center gap-1.5 text-[12.5px] text-ios-orange">
          <AlertTriangle className="size-3.5" /> Leaves an odd lot under 2 boxes that will be hard to sell
        </div>
      )}
      {lot.godowns.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {lot.godowns.map((g) => (
            <span key={g.godownId} className="rounded-md bg-fill px-2 py-0.5 text-[12px] text-muted-foreground">
              {g.name}: {formatBoxes(g.availablePcs, tile ? product.pcsPerBox : null)}
              {tile && product.pcsPerBox ? ` (${piecesToSqft(g.availablePcs, product).toFixed(0)} sq ft)` : ""}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
