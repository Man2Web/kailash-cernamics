// Zod schemas for the CRM module (leads, follow-ups, site visits).
import { z } from "zod";
import { LEAD_STATUSES } from "../enums";

export const CRM_LEAD_SOURCES = ["WALK_IN", "PHONE", "WHATSAPP", "WEBSITE", "REFERRAL", "ARCHITECT", "CONTRACTOR", "EXHIBITION", "OTHER"] as const;

export const crmLeadSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(150),
  phone: z.string().trim().max(20).optional().nullable(),
  email: z.string().trim().email().optional().nullable().or(z.literal("")),
  source: z.string().trim().min(1).max(40).default("WALK_IN"),
  status: z.enum(LEAD_STATUSES).default("NEW"),
  assignedToId: z.string().optional().nullable(),
  requirement: z.string().trim().max(2000).optional().nullable(),
  siteAddress: z.string().trim().max(500).optional().nullable(),
  nextFollowupAt: z.coerce.date().optional().nullable(),
  partyId: z.string().optional().nullable(),
  influencerId: z.string().optional().nullable(),
  lostReason: z.string().trim().max(300).optional().nullable(),
});
export type CrmLeadInput = z.infer<typeof crmLeadSchema>;

export const crmFollowupCreateSchema = z.object({
  leadId: z.string().min(1),
  dueAt: z.coerce.date(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const crmFollowupDoneSchema = z.object({
  outcome: z.string().trim().min(1, "What happened?").max(500),
  nextDueAt: z.coerce.date().optional().nullable(),
  nextNotes: z.string().trim().max(1000).optional().nullable(),
  status: z.enum(LEAD_STATUSES).optional(),
});

export const crmSiteVisitSchema = z.object({
  leadId: z.string().optional().nullable(),
  partyId: z.string().optional().nullable(),
  siteId: z.string().optional().nullable(),
  lat: z.coerce.number().min(-90).max(90).optional().nullable(),
  lng: z.coerce.number().min(-180).max(180).optional().nullable(),
  photos: z.array(z.string()).default([]),
  notes: z.string().trim().max(2000).optional().nullable(),
});
