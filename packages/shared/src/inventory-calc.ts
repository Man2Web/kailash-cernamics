// Tile & sanitary inventory maths shared by web and API: single-lot fulfilment, reorder quantities,
// truck weight and area in sq m.
import { piecesToSqft, roundUpToBox, SQFT_PER_SQM, type TileSpec } from "./units";

export interface LotStock {
  batchId: string;
  /** available pieces (saleable − reserved) in this lot */
  available: number;
  /** days since the lot was received; older lots should go first */
  ageDays?: number;
}

export interface LotOption<T extends LotStock = LotStock> {
  lot: T;
  /** this one lot covers the whole requirement */
  fits: boolean;
  shortPcs: number;
  leftoverPcs: number;
}

/**
 * Customers need a whole order from ONE shade lot. Lots that fit come first: a much older lot
 * first (FIFO); otherwise one the order clears exactly, then one leaving a sellable remainder
 * (smallest first, so big lots stay intact for big orders), and last one that would leave an odd
 * lot under two boxes. Lots that don't fit follow, largest first.
 */
export function rankLotsForRequirement<T extends LotStock>(lots: T[], requiredPcs: number, pcsPerBox?: number | null): LotOption<T>[] {
  const tier = (leftover: number) => (leftover === 0 ? 0 : isOddLeftover(leftover, pcsPerBox) ? 2 : 1);
  const opts = lots
    .filter((l) => l.available > 0)
    .map((lot) => ({
      lot,
      fits: lot.available >= requiredPcs,
      shortPcs: Math.max(0, requiredPcs - lot.available),
      leftoverPcs: Math.max(0, lot.available - requiredPcs),
    }));
  return opts.sort((a, b) => {
    if (a.fits !== b.fits) return a.fits ? -1 : 1;
    if (a.fits) {
      const age = (b.lot.ageDays ?? 0) - (a.lot.ageDays ?? 0);
      if (Math.abs(age) > 30) return age;
      const t = tier(a.leftoverPcs) - tier(b.leftoverPcs);
      if (t !== 0) return t;
      return a.leftoverPcs - b.leftoverPcs;
    }
    return b.lot.available - a.lot.available;
  });
}

/** Leftover after a sale that's smaller than one box is an "odd lot" that is hard to sell. */
export function isOddLeftover(leftoverPcs: number, pcsPerBox: number | null | undefined, minBoxes = 2): boolean {
  if (!pcsPerBox || leftoverPcs <= 0) return false;
  return leftoverPcs < pcsPerBox * minBoxes;
}

export interface ReorderInput {
  /** pieces sold (outward) in the look-back window */
  soldPcs: number;
  windowDays: number;
  availablePcs: number;
  /** open purchase-order quantity not yet received */
  onOrderPcs: number;
  leadTimeDays: number;
  safetyStockDays: number;
  reorderLevelPcs?: number;
  pcsPerBox?: number | null;
}

export interface ReorderResult {
  dailyPcs: number;
  /** days the current available + on-order stock lasts at the current sales rate */
  coverDays: number | null;
  targetPcs: number;
  suggestedPcs: number;
  reason: "BELOW_REORDER_LEVEL" | "COVER_BELOW_LEAD_TIME" | "OK";
}

/**
 * Reorder when stock (available + on order) won't last the lead time plus safety days at the
 * recent sales rate, or when it falls below the product's reorder level. Suggests enough to cover
 * lead time + safety + one lead-time cycle, rounded up to full boxes.
 */
export function reorderSuggestion(i: ReorderInput): ReorderResult {
  const dailyPcs = i.windowDays > 0 ? i.soldPcs / i.windowDays : 0;
  const position = i.availablePcs + i.onOrderPcs;
  const coverDays = dailyPcs > 0 ? position / dailyPcs : null;
  const demandTarget = Math.ceil(dailyPcs * (2 * i.leadTimeDays + i.safetyStockDays));
  const targetPcs = Math.max(demandTarget, i.reorderLevelPcs ?? 0);
  let reason: ReorderResult["reason"] = "OK";
  if ((i.reorderLevelPcs ?? 0) > 0 && position < (i.reorderLevelPcs ?? 0)) reason = "BELOW_REORDER_LEVEL";
  else if (coverDays !== null && coverDays < i.leadTimeDays + i.safetyStockDays) reason = "COVER_BELOW_LEAD_TIME";
  let suggestedPcs = reason === "OK" ? 0 : Math.max(0, targetPcs - position);
  if (suggestedPcs > 0 && i.pcsPerBox) suggestedPcs = roundUpToBox(suggestedPcs, i.pcsPerBox);
  return { dailyPcs, coverDays, targetPcs, suggestedPcs, reason };
}

/** Load weight in kg: tiles by box weight (pro rata for loose pieces), sanitary by unit weight. */
export function weightKg(pcs: number, p: { uomType: string; pcsPerBox?: number | null; weightPerBoxKg?: number | null }): number {
  if (!p.weightPerBoxKg) return 0;
  if (p.uomType === "PIECE_BOX_AREA" && p.pcsPerBox) return (pcs / p.pcsPerBox) * p.weightPerBoxKg;
  return pcs * p.weightPerBoxKg;
}

export function sqftToSqmRounded(sqft: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round((sqft / SQFT_PER_SQM) * f) / f;
}

/** "155.0 sq ft · 14.40 sq m" */
export function formatArea(pcs: number, spec: TileSpec): string {
  const sqft = piecesToSqft(pcs, spec);
  return `${sqft.toFixed(1)} sq ft · ${sqftToSqmRounded(sqft).toFixed(2)} sq m`;
}

/** Truck capacity check for dispatch planning. */
export function loadStatus(totalKg: number, capacityKg: number | null | undefined): { pct: number | null; over: boolean } {
  if (!capacityKg) return { pct: null, over: false };
  const pct = Math.round((totalKg / capacityKg) * 100);
  return { pct, over: totalKg > capacityKg };
}
