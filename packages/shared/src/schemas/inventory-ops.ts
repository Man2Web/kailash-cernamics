// Zod schemas for godown operations: physical stock counts, labels and scan lookup.
import { z } from "zod";

export const opsCountCreateSchema = z.object({
  date: z.coerce.date().optional(),
  godownId: z.string().min(1, "Godown is required"),
  rackId: z.string().optional().nullable(),
  brandId: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  blind: z.boolean().default(true),
  notes: z.string().trim().max(500).optional().nullable(),
});
export type OpsCountCreateInput = z.infer<typeof opsCountCreateSchema>;

export const opsCountLinesSchema = z.object({
  lines: z
    .array(
      z.object({
        lineId: z.string().min(1),
        countedPcs: z.coerce.number().int().min(0).nullable(),
        note: z.string().trim().max(200).optional().nullable(),
      }),
    )
    .min(1),
});
export type OpsCountLinesInput = z.infer<typeof opsCountLinesSchema>;

/** Stock found during the count that the system doesn't list in this location. */
export const opsCountFoundSchema = z.object({
  productId: z.string().min(1),
  batchId: z.string().min(1),
  rackId: z.string().optional().nullable(),
  countedPcs: z.coerce.number().int().min(0),
  note: z.string().trim().max(200).optional().nullable(),
});
export type OpsCountFoundInput = z.infer<typeof opsCountFoundSchema>;

export const opsCountSubmitSchema = z.object({
  treatUncountedAsZero: z.boolean().default(false),
});

/** QR payloads printed on labels. */
export const LABEL_BATCH_PREFIX = "GC:B:";
export const LABEL_RACK_PREFIX = "GC:R:";
