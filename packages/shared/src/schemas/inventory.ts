// Zod schemas for the inventory module (transfers, adjustments, breakage).
import { z } from "zod";
import { BREAKAGE_STAGES, STOCK_TYPES } from "../enums";

const moveStockType = z.enum(["SALEABLE", "DISPLAY", "DAMAGED"]);

export const inventoryTransferLineSchema = z.object({
  productId: z.string().min(1, "Product is required"),
  batchId: z.string().min(1, "Batch is required"),
  fromRackId: z.string().optional().nullable(),
  toRackId: z.string().optional().nullable(),
  fromStockType: moveStockType.default("SALEABLE"),
  toStockType: moveStockType.default("SALEABLE"),
  qtyPcs: z.coerce.number().int().positive("Quantity must be more than 0"),
});

export const inventoryTransferSchema = z.object({
  date: z.coerce.date().optional(),
  fromGodownId: z.string().min(1, "From godown is required"),
  toGodownId: z.string().min(1, "To godown is required"),
  notes: z.string().trim().max(1000).optional().nullable(),
  /** inter-branch transfers: truck details */
  vehicleNo: z.string().trim().max(20).optional().nullable(),
  driverName: z.string().trim().max(80).optional().nullable(),
  lines: z.array(inventoryTransferLineSchema).min(1, "Add at least one line"),
});
export type InventoryTransferInput = z.infer<typeof inventoryTransferSchema>;

export const inventoryAdjustmentLineSchema = z.object({
  productId: z.string().min(1, "Product is required"),
  batchId: z.string().min(1, "Batch is required"),
  rackId: z.string().optional().nullable(),
  stockType: z.enum(STOCK_TYPES).default("SALEABLE"),
  /** signed: + adds stock, - removes stock */
  qtyPcs: z.coerce.number().int().refine((v) => v !== 0, "Quantity cannot be 0"),
});

export const inventoryAdjustmentSchema = z.object({
  date: z.coerce.date().optional(),
  godownId: z.string().min(1, "Godown is required"),
  reason: z.string().trim().min(3, "Reason is required").max(500),
  lines: z.array(inventoryAdjustmentLineSchema).min(1, "Add at least one line"),
});
export type InventoryAdjustmentInput = z.infer<typeof inventoryAdjustmentSchema>;

export const inventoryBreakageSchema = z.object({
  date: z.coerce.date().optional(),
  stage: z.enum(BREAKAGE_STAGES),
  productId: z.string().min(1, "Product is required"),
  batchId: z.string().min(1, "Batch is required"),
  godownId: z.string().min(1, "Godown is required"),
  rackId: z.string().optional().nullable(),
  qtyPcs: z.coerce.number().int().positive("Quantity must be more than 0"),
  reason: z.string().trim().min(3, "Reason is required").max(500),
  photos: z.array(z.string()).default([]),
});
export type InventoryBreakageInput = z.infer<typeof inventoryBreakageSchema>;

/** Receiving an inter-branch transfer at the destination branch. */
export const inventoryTransferReceiveSchema = z.object({
  lines: z
    .array(
      z.object({
        lineId: z.string().min(1),
        receivedPcs: z.coerce.number().int().min(0),
        damagedPcs: z.coerce.number().int().min(0).default(0),
        toRackId: z.string().optional().nullable(),
      }),
    )
    .min(1),
  note: z.string().trim().max(500).optional().nullable(),
});
export type InventoryTransferReceiveInput = z.infer<typeof inventoryTransferReceiveSchema>;
