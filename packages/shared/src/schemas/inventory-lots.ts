// Zod schemas for shade/lot control, stock analysis and the reorder planner.
import { z } from "zod";
import { listQuerySchema } from "./common";

export const LOT_QTY_UNITS = ["SQFT", "BOXES", "PCS"] as const;
export type LotQtyUnit = (typeof LOT_QTY_UNITS)[number];

export const lotFinderQuerySchema = z.object({
  productId: z.string().min(1, "Pick a product"),
  qty: z.coerce.number().positive("Enter the quantity needed"),
  unit: z.enum(LOT_QTY_UNITS).default("SQFT"),
  wastagePct: z.coerce.number().min(0).max(50).default(0),
  partyId: z.string().optional(),
  siteId: z.string().optional(),
});
export type LotFinderQuery = z.infer<typeof lotFinderQuerySchema>;

export const shadeStockQuerySchema = listQuerySchema.extend({
  brandId: z.string().optional(),
  categoryId: z.string().optional(),
  sizeId: z.string().optional(),
  finishId: z.string().optional(),
  godownId: z.string().optional(),
  productId: z.string().optional(),
  minAgeDays: z.coerce.number().int().min(0).optional(),
  onlyAvailable: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
});
export type ShadeStockQuery = z.infer<typeof shadeStockQuerySchema>;

export const siteHistoryQuerySchema = z
  .object({ partyId: z.string().optional(), siteId: z.string().optional(), productId: z.string().optional() })
  .refine((v) => v.partyId || v.siteId, "Pick a customer or site");

export const STOCK_ANALYSIS_GROUPS = ["size", "finish", "application", "brand", "category", "godown", "grade"] as const;
export type StockAnalysisGroup = (typeof STOCK_ANALYSIS_GROUPS)[number];

export const stockAnalysisQuerySchema = z.object({
  groupBy: z.enum(STOCK_ANALYSIS_GROUPS).default("size"),
  categoryType: z.string().optional(),
  brandId: z.string().optional(),
});

export const reorderQuerySchema = z.object({
  brandId: z.string().optional(),
  windowDays: z.coerce.number().int().min(7).max(365).default(90),
  /** "false" lists every product, not only those that need ordering */
  onlyNeeded: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  q: z.string().trim().optional(),
});

export const reorderPurchaseOrderSchema = z.object({
  supplierId: z.string().min(1, "Pick the supplier"),
  brandId: z.string().optional().nullable(),
  lines: z
    .array(z.object({ productId: z.string().min(1), qtyPcs: z.coerce.number().int().positive() }))
    .min(1, "Select at least one product"),
  notes: z.string().trim().max(500).optional(),
});
export type ReorderPurchaseOrderInput = z.infer<typeof reorderPurchaseOrderSchema>;
