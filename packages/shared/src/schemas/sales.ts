// Zod schemas and pure maths for the sales module (quotations, orders, invoices, challans, returns).
// The billing screen and the API use these helpers so both compute identical numbers.
import { z } from "zod";
import { AREA_TYPES, PRICE_BASES, STOCK_TYPES } from "../enums";
import { DEFAULT_WASTAGE, floorArea, piecesForArea, skirtingArea, splitBoxes, toPerPieceRate, wallArea } from "../units";
import { computeDocTotals, computeLine, type LineTotals } from "../gst";

const optId = z.string().min(1).optional().nullable();
const paise = z.coerce.number().int().min(0);
const pct = z.coerce.number().min(0).max(100);

// ---------------------------------------------------------------- maths

export interface SalesProductSpec {
  uomType: string;
  pcsPerBox?: number | null;
  sqftPerBox?: number | null;
  allowLooseSale?: boolean | null;
  gstRate: number;
}

export interface SalesRoomDims {
  lengthFt: number;
  widthFt: number;
  heightFt?: number | null;
  deductionsSqft?: number | null;
}

/** Area of a room surface in sq ft. Highlighter (and any override) uses the entered area. */
export function salesAreaSqft(room: SalesRoomDims, areaType: string, override?: number | null): number {
  if (override !== undefined && override !== null && override > 0) return override;
  switch (areaType) {
    case "FLOOR":
      return floorArea(room.lengthFt, room.widthFt);
    case "WALL":
      return wallArea(room.lengthFt, room.widthFt, room.heightFt ?? 0, room.deductionsSqft ?? 0);
    case "SKIRTING":
      return skirtingArea(room.lengthFt, room.widthFt);
    default:
      return 0;
  }
}

export function salesDefaultWastage(areaType: string, settings?: Record<string, unknown>): number {
  const key = `wastage.${areaType.toLowerCase()}`;
  const v = settings?.[key];
  return typeof v === "number" ? v : (DEFAULT_WASTAGE[areaType] ?? 5);
}

/** Pieces, boxes and loose pieces needed to tile an area with wastage. */
export function salesAreaQty(product: SalesProductSpec, reqSqft: number, wastagePct: number): { qtyPcs: number; boxes: number; loosePcs: number } {
  const qtyPcs = piecesForArea(reqSqft, wastagePct, {
    pcsPerBox: product.pcsPerBox,
    sqftPerBox: product.sqftPerBox,
    allowLooseSale: product.allowLooseSale,
  });
  const { boxes, loose } = splitBoxes(qtyPcs, product.pcsPerBox ?? 0);
  return { qtyPcs, boxes, loosePcs: loose };
}

export interface SalesLineInput {
  qtyPcs: number;
  priceBasis: string;
  enteredRatePaise: number;
  discountPct?: number | null;
}

/** Per-piece rate (stored) and GST amounts for one line. */
export function salesLineAmounts(product: SalesProductSpec, line: SalesLineInput, interState: boolean): LineTotals & { ratePaise: number } {
  const ratePaise = toPerPieceRate(line.enteredRatePaise, line.priceBasis, { pcsPerBox: product.pcsPerBox, sqftPerBox: product.sqftPerBox });
  return { ratePaise, ...computeLine({ qtyPcs: line.qtyPcs, ratePaise, discountPct: line.discountPct ?? 0, gstRate: product.gstRate }, interState) };
}

/** Totals for a sales document (lines + transport/loading charges taxed at chargesGstRate). */
export function salesDocTotals(
  lines: { product: SalesProductSpec; line: SalesLineInput }[],
  interState: boolean,
  chargesPaise = 0,
  chargesGstRate = 18,
) {
  const rates = lines.map((l) => toPerPieceRate(l.line.enteredRatePaise, l.line.priceBasis, { pcsPerBox: l.product.pcsPerBox, sqftPerBox: l.product.sqftPerBox }));
  const totals = computeDocTotals(
    lines.map((l, i) => ({ qtyPcs: l.line.qtyPcs, ratePaise: rates[i], discountPct: l.line.discountPct ?? 0, gstRate: l.product.gstRate })),
    interState,
    chargesPaise,
    chargesGstRate,
  );
  return { ...totals, rates };
}

/** Default price basis for a product: per sq ft for tiles, per unit otherwise. */
export function salesDefaultBasis(product: { uomType: string }): "PER_SQFT" | "PER_BOX" | "PER_UNIT" {
  return product.uomType === "PIECE_BOX_AREA" ? "PER_SQFT" : "PER_UNIT";
}

/** WhatsApp click-to-chat link (no API needed). Phone without + or spaces; Indian numbers get 91. */
export function salesWhatsAppLink(phone: string | null | undefined, text: string): string {
  let p = String(phone ?? "").replace(/\D/g, "");
  if (p.length === 10) p = `91${p}`;
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}

// ---------------------------------------------------------------- schemas

export const salesLineSchema = z.object({
  productId: z.string().min(1, "Product is required"),
  batchId: optId,
  godownId: optId,
  qtyPcs: z.coerce.number().int().positive("Quantity must be more than 0"),
  priceBasis: z.enum(PRICE_BASES),
  enteredRatePaise: paise,
  discountPct: pct.default(0),
  orderLineId: optId,
});
export type SalesLineValues = z.infer<typeof salesLineSchema>;

export const salesQuotationAreaSchema = z.object({
  areaType: z.enum(AREA_TYPES),
  wastagePct: pct.optional().nullable(),
  /** entered area (highlighter, or override of the computed area) */
  areaSqft: z.coerce.number().min(0).optional().nullable(),
  productId: z.string().min(1, "Pick a tile for this area"),
  priceBasis: z.enum(PRICE_BASES).default("PER_SQFT"),
  enteredRatePaise: paise,
  discountPct: pct.default(0),
});

export const salesQuotationRoomSchema = z.object({
  name: z.string().trim().min(1, "Room name is required").max(80),
  lengthFt: z.coerce.number().min(0),
  widthFt: z.coerce.number().min(0),
  heightFt: z.coerce.number().min(0).optional().nullable(),
  deductionsSqft: z.coerce.number().min(0).default(0),
  areas: z.array(salesQuotationAreaSchema).default([]),
});

export const salesQuotationItemSchema = z.object({
  productId: z.string().min(1, "Product is required"),
  qtyPcs: z.coerce.number().int().positive("Quantity must be more than 0"),
  priceBasis: z.enum(PRICE_BASES),
  enteredRatePaise: paise,
  discountPct: pct.default(0),
});

export const salesQuotationSchema = z
  .object({
    partyId: optId,
    customerName: z.string().trim().max(120).optional().nullable(),
    customerPhone: z.string().trim().max(20).optional().nullable(),
    siteId: optId,
    influencerId: optId,
    date: z.coerce.date().optional(),
    validUntil: z.coerce.date().optional().nullable(),
    placeOfSupply: z.string().regex(/^[0-9]{2}$/).optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
    transportPaise: paise.default(0),
    loadingPaise: paise.default(0),
    rooms: z.array(salesQuotationRoomSchema).default([]),
    items: z.array(salesQuotationItemSchema).default([]),
  })
  .refine((v) => v.partyId || v.customerName, { message: "Pick a customer or enter a name", path: ["partyId"] })
  .refine((v) => v.rooms.some((r) => r.areas.length) || v.items.length, { message: "Add at least one room area or item", path: ["items"] });
export type SalesQuotationInput = z.infer<typeof salesQuotationSchema>;

export const salesQuotationStatusSchema = z.object({ status: z.enum(["SENT", "ACCEPTED", "REJECTED"]) });

export const salesOrderSchema = z.object({
  partyId: z.string().min(1, "Customer is required"),
  siteId: optId,
  influencerId: optId,
  quotationId: optId,
  date: z.coerce.date().optional(),
  deliveryDate: z.coerce.date().optional().nullable(),
  placeOfSupply: z.string().regex(/^[0-9]{2}$/).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  transportPaise: paise.default(0),
  loadingPaise: paise.default(0),
  lines: z.array(salesLineSchema).min(1, "Add at least one line"),
  /** confirm right away: discount/credit checks + batch reservation */
  confirm: z.boolean().default(false),
});
export type SalesOrderInput = z.infer<typeof salesOrderSchema>;

export const salesSplitSchema = z.object({
  parts: z
    .array(z.object({ batchId: z.string().min(1), godownId: optId, qtyPcs: z.coerce.number().int().positive() }))
    .min(1),
});

export const salesInvoiceSchema = z.object({
  partyId: z.string().min(1, "Customer is required"),
  siteId: optId,
  influencerId: optId,
  salesOrderId: optId,
  date: z.coerce.date().optional(),
  placeOfSupply: z.string().regex(/^[0-9]{2}$/).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  transportPaise: paise.default(0),
  loadingPaise: paise.default(0),
  lines: z.array(salesLineSchema).min(1, "Add at least one line"),
  /** post immediately after saving */
  post: z.boolean().default(false),
});
export type SalesInvoiceInput = z.infer<typeof salesInvoiceSchema>;

export const salesCancelSchema = z.object({ reason: z.string().trim().min(3, "Give a reason").max(500) });

export const salesChallanSchema = z.object({
  invoiceId: z.string().min(1, "Pick a posted invoice"),
  date: z.coerce.date().optional(),
  notes: z.string().max(1000).optional().nullable(),
  lines: z
    .array(z.object({ invoiceLineId: z.string().min(1), qtyPcs: z.coerce.number().int().positive() }))
    .optional(),
});

export const salesDispatchSchema = z.object({
  vehicleId: optId,
  vehicleNo: z.string().trim().max(20).optional().nullable(),
  driverName: z.string().trim().max(80).optional().nullable(),
  driverPhone: z.string().trim().max(20).optional().nullable(),
  loadingPaise: paise.default(0),
  unloadingPaise: paise.default(0),
  notes: z.string().max(1000).optional().nullable(),
});

export const salesDeliverSchema = z.object({ podPhoto: z.string().max(500).optional().nullable(), deliveredAt: z.coerce.date().optional() });

export const salesReturnSchema = z.object({
  invoiceId: z.string().min(1, "Pick an invoice"),
  date: z.coerce.date().optional(),
  reason: z.string().trim().max(500).optional().nullable(),
  lines: z
    .array(
      z.object({
        invoiceLineId: z.string().min(1),
        qtyPcs: z.coerce.number().int().positive(),
        toStockType: z.enum(STOCK_TYPES).refine((v) => v === "SALEABLE" || v === "DAMAGED", "Return to saleable or damaged"),
      }),
    )
    .min(1, "Add at least one line"),
});
export type SalesReturnInput = z.infer<typeof salesReturnSchema>;
