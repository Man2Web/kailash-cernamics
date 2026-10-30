// Unit conversion for tiles and sanitary. Tiles are stored in PIECES; boxes and sq ft are derived
// from pcs_per_box (P) and sqft_per_box (A). See docs/specs/business-rules.md.

export const SQFT_PER_SQM = 10.7639;

/** Float tolerance so 155.0000000001 sq ft does not round up to an extra box. */
const EPS = 1e-9;

export interface TileSpec {
  pcsPerBox: number | null | undefined;
  sqftPerBox: number | null | undefined;
}

export interface ProductUnitSpec extends TileSpec {
  uomType: "PIECE_BOX_AREA" | "UNIT" | string;
  unitName?: string | null;
}

export function isTile(p: { uomType: string }): boolean {
  return p.uomType === "PIECE_BOX_AREA";
}

export function sqmToSqft(sqm: number): number {
  return sqm * SQFT_PER_SQM;
}

export function sqftToSqm(sqft: number): number {
  return sqft / SQFT_PER_SQM;
}

/** Split a piece count into whole boxes + loose pieces. Negative counts keep their sign on both parts. */
export function splitBoxes(pcs: number, pcsPerBox: number): { boxes: number; loose: number } {
  if (!pcsPerBox || pcsPerBox <= 0) return { boxes: 0, loose: pcs };
  const sign = pcs < 0 ? -1 : 1;
  const abs = Math.abs(pcs);
  return { boxes: sign * Math.floor(abs / pcsPerBox), loose: sign * (abs % pcsPerBox) };
}

export function piecesToSqft(pcs: number, spec: TileSpec): number {
  if (!spec.pcsPerBox || !spec.sqftPerBox) return 0;
  return (pcs * spec.sqftPerBox) / spec.pcsPerBox;
}

export function piecesFromBoxes(boxes: number, loosePcs: number, pcsPerBox: number): number {
  return boxes * pcsPerBox + loosePcs;
}

/**
 * Boxes needed to cover an area with wastage:
 *   boxes = ceil( required_sqft × (1 + wastage%) / sqft_per_box )
 */
export function boxesForArea(requiredSqft: number, wastagePct: number, sqftPerBox: number): number {
  if (!sqftPerBox || sqftPerBox <= 0 || requiredSqft <= 0) return 0;
  const withWastage = requiredSqft * (1 + (wastagePct || 0) / 100);
  return Math.ceil(withWastage / sqftPerBox - EPS);
}

/**
 * Pieces needed for an area. Rounds up to full boxes unless loose sale is allowed, in which case it
 * rounds up to the next whole piece.
 */
export function piecesForArea(
  requiredSqft: number,
  wastagePct: number,
  spec: TileSpec & { allowLooseSale?: boolean | null },
): number {
  const P = spec.pcsPerBox ?? 0;
  const A = spec.sqftPerBox ?? 0;
  if (!P || !A || requiredSqft <= 0) return 0;
  if (!spec.allowLooseSale) return boxesForArea(requiredSqft, wastagePct, A) * P;
  const withWastage = requiredSqft * (1 + (wastagePct || 0) / 100);
  return Math.ceil((withWastage * P) / A - EPS);
}

/** Round a piece count up to full boxes (when loose sale is not allowed). */
export function roundUpToBox(pcs: number, pcsPerBox: number): number {
  if (!pcsPerBox) return pcs;
  return Math.ceil(pcs / pcsPerBox) * pcsPerBox;
}

/** "12 box + 3 pcs (155.0 sq ft)" for tiles; "4 nos" for unit items. */
export function formatQty(pcs: number, p: ProductUnitSpec): string {
  if (!isTile(p) || !p.pcsPerBox) return `${pcs} ${p.unitName || "nos"}`;
  const { boxes, loose } = splitBoxes(pcs, p.pcsPerBox);
  const sqft = piecesToSqft(pcs, p);
  const parts = loose ? `${boxes} box + ${loose} pcs` : `${boxes} box`;
  return `${parts} (${sqft.toFixed(1)} sq ft)`;
}

/** Short form without area: "12 box + 3 pcs". */
export function formatBoxes(pcs: number, pcsPerBox: number | null | undefined): string {
  if (!pcsPerBox) return `${pcs}`;
  const { boxes, loose } = splitBoxes(pcs, pcsPerBox);
  return loose ? `${boxes} box + ${loose} pcs` : `${boxes} box`;
}

// ---- Rate conversion (all rates in integer paise) ----

/** Price entered per sq ft → per-piece rate in paise. */
export function ratePerSqftToPerPiece(paisePerSqft: number, spec: TileSpec): number {
  if (!spec.pcsPerBox || !spec.sqftPerBox) return paisePerSqft;
  return Math.round((paisePerSqft * spec.sqftPerBox) / spec.pcsPerBox);
}

/** Price entered per box → per-piece rate in paise. */
export function ratePerBoxToPerPiece(paisePerBox: number, pcsPerBox: number | null | undefined): number {
  if (!pcsPerBox) return paisePerBox;
  return Math.round(paisePerBox / pcsPerBox);
}

export function ratePerPieceToPerBox(paisePerPiece: number, pcsPerBox: number | null | undefined): number {
  if (!pcsPerBox) return paisePerPiece;
  return paisePerPiece * pcsPerBox;
}

export function ratePerPieceToPerSqft(paisePerPiece: number, spec: TileSpec): number {
  if (!spec.pcsPerBox || !spec.sqftPerBox) return paisePerPiece;
  return Math.round((paisePerPiece * spec.pcsPerBox) / spec.sqftPerBox);
}

/** Convert a price in the given basis to the per-piece (or per-unit) rate stored on lines. */
export function toPerPieceRate(
  pricePaise: number,
  basis: "PER_SQFT" | "PER_BOX" | "PER_UNIT" | string,
  spec: TileSpec,
): number {
  if (basis === "PER_SQFT") return ratePerSqftToPerPiece(pricePaise, spec);
  if (basis === "PER_BOX") return ratePerBoxToPerPiece(pricePaise, spec.pcsPerBox);
  return pricePaise;
}

// ---- Room areas ----

export function floorArea(lengthFt: number, widthFt: number): number {
  return Math.max(0, (lengthFt || 0) * (widthFt || 0));
}

/** Wall area = 2 × (L + W) × H − deductions (doors/windows). */
export function wallArea(lengthFt: number, widthFt: number, heightFt: number, deductionsSqft = 0): number {
  return Math.max(0, 2 * ((lengthFt || 0) + (widthFt || 0)) * (heightFt || 0) - (deductionsSqft || 0));
}

/** Skirting running length in ft = perimeter; area assumes the given skirting height in ft. */
export function skirtingArea(lengthFt: number, widthFt: number, skirtingHeightFt = 0.33): number {
  return Math.max(0, 2 * ((lengthFt || 0) + (widthFt || 0)) * skirtingHeightFt);
}

export const DEFAULT_WASTAGE: Record<string, number> = {
  FLOOR: 5,
  WALL: 8,
  SKIRTING: 8,
  HIGHLIGHTER: 8,
};
