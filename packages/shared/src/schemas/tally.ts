// Zod schemas for the Tally sync contract (docs/specs/tally.md).
import { z } from "zod";

export const tallyAckSchema = z.object({
  queueId: z.string().min(1),
  status: z.enum(["SUCCESS", "FAILED"]),
  tallyGuid: z.string().max(200).optional().nullable(),
  rawResponse: z.string().max(200000).optional().nullable(),
  error: z.string().max(5000).optional().nullable(),
});
export type TallyAck = z.infer<typeof tallyAckSchema>;

export const tallyInboundItemSchema = z.object({
  guid: z.string().optional().nullable(),
  name: z.string().optional().nullable(),
  alterId: z.coerce.number().optional().nullable(),
  /** VOUCHER: Receipt / Payment / Credit Note / Debit Note */
  voucherType: z.string().optional().nullable(),
  voucherNumber: z.string().optional().nullable(),
  date: z.string().optional().nullable(),
  partyName: z.string().optional().nullable(),
  partyGuid: z.string().optional().nullable(),
  amountPaise: z.coerce.number().int().optional().nullable(),
  closingPaise: z.coerce.number().int().optional().nullable(),
  billRefs: z.array(z.object({ name: z.string(), amountPaise: z.coerce.number().int() })).optional().nullable(),
  parent: z.string().optional().nullable(),
  gstin: z.string().optional().nullable(),
});

export const tallyInboundSchema = z.object({
  kind: z.enum(["LEDGER", "VOUCHER", "BALANCE", "OUTSTANDING"]),
  items: z.array(tallyInboundItemSchema).max(5000),
  lastAlterId: z.coerce.number().int().optional().nullable(),
});
export type TallyInbound = z.infer<typeof tallyInboundSchema>;

export const tallyHeartbeatSchema = z.object({
  tallyRunning: z.boolean(),
  companyLoaded: z.boolean().optional(),
  companyName: z.string().max(200).optional().nullable(),
  version: z.string().max(100).optional().nullable(),
});

export const tallyAgentCreateSchema = z.object({
  branchId: z.string().min(1),
  name: z.string().trim().min(1).max(100),
});
