// Zod schemas for samples out, showroom display boards and supplier breakage claims.
import { z } from "zod";

const id = z.string().min(1);
const pcs = z.coerce.number().int();

export const samplesIssueSchema = z
  .object({
    date: z.coerce.date().optional(),
    godownId: id,
    partyId: z.string().optional().nullable(),
    influencerId: z.string().optional().nullable(),
    leadId: z.string().optional().nullable(),
    issuedToName: z.string().trim().max(120).optional().nullable(),
    phone: z.string().trim().max(20).optional().nullable(),
    expectedReturnDate: z.coerce.date().optional().nullable(),
    notes: z.string().trim().max(1000).optional().nullable(),
    lines: z
      .array(z.object({ productId: id, batchId: id, qtyPcs: pcs.positive("Pieces must be more than 0") }))
      .min(1, "Add at least one sample"),
  })
  .refine((v) => v.partyId || v.influencerId || v.leadId || v.issuedToName, {
    message: "Pick a customer, influencer or lead, or type who took the samples",
    path: ["issuedToName"],
  });
export type SamplesIssueInput = z.infer<typeof samplesIssueSchema>;

export const samplesReturnSchema = z.object({
  lines: z
    .array(z.object({ lineId: id, returnedPcs: pcs.min(0).default(0), damagedPcs: pcs.min(0).default(0) }))
    .min(1),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const samplesCloseSchema = z.object({
  lines: z.array(z.object({ lineId: id, closedPcs: pcs.min(0) })).min(1),
  reason: z.string().trim().min(1, "Give a reason (kept by customer, lost…)").max(300),
});

export const samplesListSchema = z.object({
  status: z.enum(["OPEN", "PARTIAL", "CLOSED"]).optional(),
  overdue: z.enum(["true", "false"]).optional(),
  partyId: z.string().optional(),
});

export const displayBoardSchema = z.object({
  godownId: id,
  code: z.string().trim().min(1, "Code is required").max(20),
  name: z.string().trim().min(1, "Name is required").max(100),
  location: z.string().trim().max(100).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const displayItemAddSchema = z.object({
  productId: id,
  batchId: id,
  fromGodownId: id,
  qtyPcs: pcs.positive("Pieces must be more than 0"),
});

export const displayItemRemoveSchema = z.object({
  toGodownId: id,
  toStockType: z.enum(["SALEABLE", "DAMAGED"]).default("SALEABLE"),
});

export const claimCreateSchema = z.object({
  supplierId: id,
  entryIds: z.array(id).min(1, "Pick at least one breakage entry"),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const claimSettleSchema = z.object({
  settlementType: z.enum(["CREDIT_NOTE", "REPLACEMENT", "REJECTED"]),
  settledPaise: z.coerce.number().int().min(0).default(0),
  settlementRef: z.string().trim().max(60).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const breakageRateQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  groupBy: z.enum(["supplier", "brand"]).default("supplier"),
});
