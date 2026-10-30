import { z } from "zod";
import { CATEGORY_TYPES, UOM_TYPES, PRICE_BASES, SEGMENTS, TILE_APPLICATIONS } from "../enums";
import { nonNegPaiseSchema, optionalText, requiredText } from "./common";

export const brandSchema = z.object({
  name: requiredText("Name"),
  code: z.string().trim().max(20).optional().nullable(),
  isActive: z.boolean().default(true),
  /** preferred supplier/distributor used by the reorder planner */
  supplierId: z.string().optional().nullable().or(z.literal("").transform(() => null)),
  leadTimeDays: z.coerce.number().int().min(0).max(365).default(15),
});

export const categorySchema = z.object({
  name: requiredText("Name"),
  type: z.enum(CATEGORY_TYPES),
  isActive: z.boolean().default(true),
});

export const seriesSchema = z.object({
  name: requiredText("Name"),
  brandId: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

export const sizeSchema = z.object({
  name: requiredText("Name", 40),
  lengthMm: z.coerce.number().int().min(0),
  widthMm: z.coerce.number().int().min(0),
  thicknessMm: z.coerce.number().min(0).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const finishSchema = z.object({ name: requiredText("Name"), isActive: z.boolean().default(true) });

export const colorSchema = z.object({
  name: requiredText("Name"),
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable().or(z.literal("")),
  isActive: z.boolean().default(true),
});

export const productSchema = z
  .object({
    sku: requiredText("SKU", 60),
    name: requiredText("Name"),
    brandId: z.string().min(1, "Brand is required"),
    categoryId: z.string().min(1, "Category is required"),
    seriesId: z.string().optional().nullable(),
    sizeId: z.string().optional().nullable(),
    finishId: z.string().optional().nullable(),
    colorId: z.string().optional().nullable(),
    hsn: z.string().trim().regex(/^[0-9]{4,8}$/, "HSN must be 4–8 digits"),
    gstRate: z.coerce.number().refine((v) => [0, 5, 12, 18, 28].includes(v), "GST rate must be 0, 5, 12, 18 or 28"),
    uomType: z.enum(UOM_TYPES),
    unitName: z.string().trim().max(20).default("nos"),
    pcsPerBox: z.coerce.number().int().positive().optional().nullable(),
    sqftPerBox: z.coerce.number().positive().optional().nullable(),
    sqmPerBox: z.coerce.number().positive().optional().nullable(),
    weightPerBoxKg: z.coerce.number().min(0).optional().nullable(),
    mrpPaise: nonNegPaiseSchema.default(0),
    allowLooseSale: z.boolean().default(false),
    reorderLevelPcs: z.coerce.number().int().min(0).default(0),
    /** where the tile is used (floor, wall, parking…) */
    applications: z.array(z.enum(TILE_APPLICATIONS)).default([]),
    /** overrides the brand lead time for reorder planning */
    leadTimeDays: z.coerce.number().int().min(0).max(365).optional().nullable(),
    safetyStockDays: z.coerce.number().int().min(0).max(180).default(7),
    images: z.array(z.string()).default([]),
    description: optionalText,
    isActive: z.boolean().default(true),
  })
  .superRefine((p, ctx) => {
    if (p.uomType === "PIECE_BOX_AREA") {
      if (!p.pcsPerBox) ctx.addIssue({ code: "custom", path: ["pcsPerBox"], message: "Pieces per box is required for tiles" });
      if (!p.sqftPerBox) ctx.addIssue({ code: "custom", path: ["sqftPerBox"], message: "Sq ft per box is required for tiles" });
    }
  });
export type ProductInput = z.infer<typeof productSchema>;

export const productVariantSchema = z.object({
  productId: z.string().min(1),
  colorId: z.string().optional().nullable(),
  skuSuffix: requiredText("SKU suffix", 20),
  name: z.string().trim().max(100).optional().nullable(),
  mrpPaise: nonNegPaiseSchema.optional().nullable(),
});

export const priceListSchema = z.object({
  name: requiredText("Name"),
  segment: z.enum(SEGMENTS),
  isActive: z.boolean().default(true),
});

export const priceListItemSchema = z.object({
  priceListId: z.string().min(1),
  productId: z.string().min(1),
  priceBasis: z.enum(PRICE_BASES),
  pricePaise: nonNegPaiseSchema,
  validFrom: z.coerce.date().optional(),
});

export const catalogueVariantUpdateSchema = productVariantSchema.omit({ productId: true }).partial();

export const cataloguePriceItemsUpsertSchema = z.object({
  items: z.array(priceListItemSchema.omit({ priceListId: true })).min(1),
});

export const cataloguePriceLookupSchema = z.object({
  productId: z.string().min(1),
  partyId: z.string().optional(),
  segment: z.enum(SEGMENTS).optional(),
});

/** Import preview/commit body: raw rows keyed by template column names. */
export const catalogueImportSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(5000),
});
