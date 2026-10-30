// Zod schemas and landed-cost helper for the purchase module.
import { z } from "zod";
import { ALLOCATION_BASES, GRADES, SCHEME_TARGET_TYPES } from "../enums";

const paise = z.coerce.number().int().min(0);

export const purchaseOrderLineSchema = z.object({
  productId: z.string().min(1, "Product is required"),
  qtyPcs: z.coerce.number().int().positive("Quantity must be more than 0"),
  /** per piece (per unit for sanitary) */
  ratePaise: paise,
  gstRate: z.coerce.number().min(0).max(28).default(18),
});

export const purchaseOrderSchema = z.object({
  date: z.coerce.date().optional(),
  supplierId: z.string().min(1, "Supplier is required"),
  brandId: z.string().optional().nullable(),
  expectedDate: z.coerce.date().optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  lines: z.array(purchaseOrderLineSchema).min(1, "Add at least one line"),
});
export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>;

export const purchaseGrnLineSchema = z.object({
  poLineId: z.string().optional().nullable(),
  productId: z.string().min(1, "Product is required"),
  /** sanitary/CP colour variant: stocked as its own lot (batch "V-<sku suffix>") */
  variantId: z.string().optional().nullable(),
  batchNo: z.string().trim().max(60).optional().nullable(),
  shadeCode: z.string().trim().max(40).optional().nullable(),
  caliber: z.string().trim().max(40).optional().nullable(),
  grade: z.enum(GRADES).default("STANDARD"),
  rackId: z.string().optional().nullable(),
  qtyPcs: z.coerce.number().int().positive("Quantity must be more than 0"),
  damagedPcs: z.coerce.number().int().min(0).default(0),
  ratePaise: paise,
});

export const purchaseGrnSchema = z.object({
  date: z.coerce.date().optional(),
  supplierId: z.string().min(1, "Supplier is required"),
  poId: z.string().optional().nullable(),
  godownId: z.string().min(1, "Godown is required"),
  supplierInvoiceNo: z.string().trim().max(60).optional().nullable(),
  truckNo: z.string().trim().max(30).optional().nullable(),
  containerNo: z.string().trim().max(30).optional().nullable(),
  freightPaise: paise.default(0),
  unloadingPaise: paise.default(0),
  otherChargesPaise: paise.default(0),
  allocationBasis: z.enum(ALLOCATION_BASES).optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
  lines: z.array(purchaseGrnLineSchema).min(1, "Add at least one line"),
});
export type PurchaseGrnInput = z.infer<typeof purchaseGrnSchema>;

export const purchaseInvoiceLineSchema = z.object({
  productId: z.string().min(1, "Product is required"),
  qtyPcs: z.coerce.number().int().positive(),
  ratePaise: paise,
  gstRate: z.coerce.number().min(0).max(28),
});

export const purchaseInvoiceSchema = z.object({
  date: z.coerce.date().optional(),
  supplierId: z.string().min(1, "Supplier is required"),
  supplierInvoiceNo: z.string().trim().min(1, "Supplier invoice no. is required").max(60),
  poId: z.string().optional().nullable(),
  grnId: z.string().optional().nullable(),
  otherChargesPaise: paise.default(0),
  dueDate: z.coerce.date().optional().nullable(),
  lines: z.array(purchaseInvoiceLineSchema).min(1, "Add at least one line"),
});
export type PurchaseInvoiceInput = z.infer<typeof purchaseInvoiceSchema>;

export const purchaseDebitNoteLineSchema = z.object({
  productId: z.string().min(1),
  batchId: z.string().optional().nullable(),
  godownId: z.string().optional().nullable(),
  /** stock returned to the supplier comes out of SALEABLE or DAMAGED */
  fromStockType: z.enum(["SALEABLE", "DAMAGED"]).default("SALEABLE"),
  qtyPcs: z.coerce.number().int().positive(),
  ratePaise: paise,
  gstRate: z.coerce.number().min(0).max(28).default(18),
});

export const purchaseDebitNoteSchema = z.object({
  date: z.coerce.date().optional(),
  supplierId: z.string().min(1, "Supplier is required"),
  purchaseInvoiceId: z.string().optional().nullable(),
  grnId: z.string().optional().nullable(),
  reason: z.string().trim().min(3, "Reason is required").max(500),
  lines: z.array(purchaseDebitNoteLineSchema).min(1, "Add at least one line"),
});
export type PurchaseDebitNoteInput = z.infer<typeof purchaseDebitNoteSchema>;

export const purchaseSchemeSchema = z.object({
  brandId: z.string().min(1, "Brand is required"),
  name: z.string().trim().min(1, "Name is required").max(200),
  periodFrom: z.coerce.date(),
  periodTo: z.coerce.date(),
  targetType: z.enum(SCHEME_TARGET_TYPES),
  isActive: z.boolean().default(true),
  notes: z.string().trim().max(1000).optional().nullable(),
  /** threshold is paise for VALUE targets, sq ft for SQFT targets */
  slabs: z.array(z.object({ threshold: z.coerce.number().int().min(0), rebatePct: z.coerce.number().min(0).max(100) })).min(1, "Add at least one slab"),
});
export type PurchaseSchemeInput = z.infer<typeof purchaseSchemeSchema>;

export const purchaseSchemeClaimSchema = z.object({
  amountPaise: paise,
  notes: z.string().trim().max(500).optional().nullable(),
});

// ---- Landed cost

export interface LandedLineInput {
  qtyPcs: number;
  /** per piece, paise */
  ratePaise: number;
  /** total weight of the line in kg (WEIGHT basis) */
  weightKg?: number | null;
}

export interface LandedLineResult {
  /** charges allocated to this line, paise */
  allocatedPaise: number;
  /** purchase rate + allocated charges per piece, paise (rounded) */
  landedRatePaise: number;
}

/**
 * Allocate GRN charges (freight + unloading + other) to lines by value or weight. Allocation is in
 * integer paise; the rounding remainder goes to the last line with a non-zero base so the allocated
 * total always equals chargesPaise exactly. Falls back to VALUE when no weights are given.
 */
export function allocateLandedCost(lines: LandedLineInput[], chargesPaise: number, basis: "VALUE" | "WEIGHT"): LandedLineResult[] {
  const charges = Math.max(0, Math.round(chargesPaise || 0));
  let bases = lines.map((l) => (basis === "WEIGHT" ? Math.max(0, l.weightKg ?? 0) : Math.max(0, l.qtyPcs * l.ratePaise)));
  let total = bases.reduce((a, b) => a + b, 0);
  if (total <= 0 && basis === "WEIGHT") {
    bases = lines.map((l) => Math.max(0, l.qtyPcs * l.ratePaise));
    total = bases.reduce((a, b) => a + b, 0);
  }
  if (total <= 0) {
    // nothing to weigh by: split by quantity
    bases = lines.map((l) => Math.max(0, l.qtyPcs));
    total = bases.reduce((a, b) => a + b, 0);
  }
  const allocated = bases.map((b) => (total > 0 ? Math.floor((charges * b) / total) : 0));
  const remainder = charges - allocated.reduce((a, b) => a + b, 0);
  if (remainder !== 0) {
    let last = -1;
    bases.forEach((b, i) => {
      if (b > 0) last = i;
    });
    if (last >= 0) allocated[last] += remainder;
  }
  return lines.map((l, i) => ({
    allocatedPaise: allocated[i],
    landedRatePaise: l.qtyPcs > 0 ? Math.round(l.ratePaise + allocated[i] / l.qtyPcs) : l.ratePaise,
  }));
}

/** Current slab and expected rebate for a scheme given achieved value (paise) or sq ft. */
export function schemeSlabFor(achieved: number, slabs: { threshold: number; rebatePct: number }[]) {
  const sorted = [...slabs].sort((a, b) => a.threshold - b.threshold);
  let current: { threshold: number; rebatePct: number } | null = null;
  let next: { threshold: number; rebatePct: number } | null = null;
  for (const s of sorted) {
    if (achieved >= s.threshold) current = s;
    else {
      next = s;
      break;
    }
  }
  return { current, next };
}
