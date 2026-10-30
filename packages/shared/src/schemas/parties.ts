// Zod schemas for the parties module (customers, suppliers, sites, influencers).
import { z } from "zod";
import { INFLUENCER_TYPES, PARTY_TYPES, SEGMENTS } from "../enums";
import { validateGstin } from "../gstin";
import { nonNegPaiseSchema, optionalText, paiseSchema, requiredText, stateCodeSchema } from "./common";

export const partiesPartySchema = z
  .object({
    type: z.enum(PARTY_TYPES),
    segment: z.enum(SEGMENTS).default("RETAIL"),
    name: requiredText("Name"),
    phone: z.string().trim().max(20).optional().nullable(),
    email: z.string().trim().email("Enter a valid email").optional().nullable().or(z.literal("")),
    gstin: z.string().trim().toUpperCase().optional().nullable().or(z.literal("")),
    stateCode: stateCodeSchema.default("33"),
    billingAddress: optionalText,
    shippingAddress: optionalText,
    city: z.string().trim().max(80).optional().nullable(),
    creditLimitPaise: nonNegPaiseSchema.default(0),
    creditDays: z.coerce.number().int().min(0).max(365).default(0),
    openingBalancePaise: paiseSchema.default(0),
    tallyLedgerName: z.string().trim().max(200).optional().nullable(),
    notes: optionalText,
    isActive: z.boolean().default(true),
  })
  .superRefine((p, ctx) => {
    if (p.gstin) {
      const r = validateGstin(p.gstin);
      if (!r.valid) ctx.addIssue({ code: "custom", path: ["gstin"], message: r.error ?? "Invalid GSTIN" });
      else if (p.gstin.slice(0, 2) !== p.stateCode) {
        ctx.addIssue({ code: "custom", path: ["stateCode"], message: `State code must match GSTIN (${p.gstin.slice(0, 2)})` });
      }
    }
  });
export type PartyInput = z.infer<typeof partiesPartySchema>;

export const partiesSiteSchema = z.object({
  name: requiredText("Site name"),
  address: optionalText,
  contactName: z.string().trim().max(80).optional().nullable(),
  contactPhone: z.string().trim().max(20).optional().nullable(),
});

export const partiesInfluencerSchema = z.object({
  type: z.enum(INFLUENCER_TYPES),
  name: requiredText("Name"),
  phone: z.string().trim().max(20).optional().nullable(),
  firm: z.string().trim().max(120).optional().nullable(),
  commissionPct: z.coerce.number().min(0).max(100).default(0),
  isActive: z.boolean().default(true),
});

/** One row of the party import sheet (strings as typed in Excel). */
export const partiesImportRowSchema = z.object({
  name: z.string(),
  type: z.string().optional(),
  segment: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  gstin: z.string().optional(),
  state_code: z.string().optional(),
  city: z.string().optional(),
  billing_address: z.string().optional(),
  credit_limit: z.string().optional(),
  credit_days: z.string().optional(),
  opening_balance: z.string().optional(),
});
