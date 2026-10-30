// Zod schemas for the accounts module (receipts, payments, cheques, outstanding).
import { z } from "zod";
import { CHEQUE_STATUSES, PAYMENT_MODES } from "../enums";

export const accountsAllocationSchema = z.object({
  invoiceId: z.string().min(1),
  amountPaise: z.coerce.number().int().positive(),
});

export const accountsReceiptCreateSchema = z
  .object({
    partyId: z.string().min(1, "Customer is required"),
    date: z.coerce.date().optional(),
    mode: z.enum(PAYMENT_MODES),
    amountPaise: z.coerce.number().int().positive("Amount must be more than zero"),
    reference: z.string().trim().max(100).optional().nullable(),
    chequeNo: z.string().trim().max(30).optional().nullable(),
    chequeDate: z.coerce.date().optional().nullable(),
    bankName: z.string().trim().max(100).optional().nullable(),
    notes: z.string().trim().max(500).optional().nullable(),
    /** "AUTO" = oldest invoice first; "MANUAL" uses allocations[] */
    allocationMode: z.enum(["AUTO", "MANUAL", "NONE"]).default("AUTO"),
    allocations: z.array(accountsAllocationSchema).default([]),
  })
  .superRefine((r, ctx) => {
    if (r.mode === "CHEQUE" && !r.chequeNo) ctx.addIssue({ code: "custom", path: ["chequeNo"], message: "Cheque number is required" });
    if (r.allocationMode === "MANUAL") {
      const sum = r.allocations.reduce((a, x) => a + x.amountPaise, 0);
      if (sum > r.amountPaise) ctx.addIssue({ code: "custom", path: ["allocations"], message: "Allocated more than the receipt amount" });
    }
  });
export type AccountsReceiptCreate = z.infer<typeof accountsReceiptCreateSchema>;

export const accountsChequeStatusSchema = z.object({
  status: z.enum(CHEQUE_STATUSES),
  note: z.string().trim().max(300).optional(),
});

export const accountsCancelSchema = z.object({ reason: z.string().trim().min(3, "Give a reason").max(300) });

export const accountsPaymentAllocationSchema = z.object({
  purchaseInvoiceId: z.string().min(1),
  amountPaise: z.coerce.number().int().positive(),
});

export const accountsPaymentCreateSchema = z.object({
  partyId: z.string().min(1, "Supplier is required"),
  date: z.coerce.date().optional(),
  mode: z.enum(PAYMENT_MODES),
  amountPaise: z.coerce.number().int().positive("Amount must be more than zero"),
  reference: z.string().trim().max(100).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  allocationMode: z.enum(["AUTO", "MANUAL", "NONE"]).default("AUTO"),
  allocations: z.array(accountsPaymentAllocationSchema).default([]),
});
export type AccountsPaymentCreate = z.infer<typeof accountsPaymentCreateSchema>;

export const accountsInfluencerPayoutSchema = z.object({
  influencerId: z.string().min(1),
  amountPaise: z.coerce.number().int().min(0).default(0),
  points: z.coerce.number().int().min(0).default(0),
  note: z.string().trim().max(300).optional().nullable(),
});

export interface AccountsOutstandingRow {
  partyId: string;
  name: string;
  phone: string | null;
  segment: string;
  creditLimitPaise: number;
  creditDays: number;
  totalPaise: number;
  overduePaise: number;
  buckets: Record<"0-30" | "31-60" | "61-90" | "90+", number>;
  advancePaise: number;
  tallyClosingPaise: number | null;
  tallyAsOf: string | null;
  whatsappUrl: string | null;
}
