"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import db from "@/lib/db/db";
import { getSession, denyUnlessCan } from "@/lib/auth/auth";
import {
  LEAD_HEARD_FROM,
  LEAD_PROJECT_TYPES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  LEAD_TIMELINES,
} from "@/lib/leads/options";

export interface CreateLeadInput {
  source: string;
  enquiryAt?: string; // ISO date-time; defaults to now
  name: string;
  phone: string;
  alternatePhone?: string;
  email?: string;
  city?: string;
  address?: string;
  interests?: string[];
  requirement?: string;
  areaSqft?: number | null;
  budget?: number | null;
  projectType?: string;
  timeline?: string;
  heardFrom?: string;
  assignedToId?: string;
  nextFollowUpDate?: string; // YYYY-MM-DD
  notes?: string;
}

export interface UpdateLeadInput {
  status?: string;
  nextFollowUpDate?: string | null;
  assignedToId?: string | null;
  notes?: string;
}

const isOneOf = (list: readonly { value: string }[], v?: string | null) => !v || list.some((o) => o.value === v);
const clean = (v?: string | null) => v?.trim() || null;
const positiveOrNull = (v?: number | null) => (v === undefined || v === null || Number.isNaN(v) || v <= 0 ? null : v);

export async function createLeadAction(input: CreateLeadInput) {
  const denied = await denyUnlessCan("leads:create");
  if (denied) return denied;
  try {
    const session = await getSession();
    if (!session) return { error: "Authentication required." };

    if (!isOneOf(LEAD_SOURCES, input.source) || !input.source) {
      return { error: "Choose whether this is a walk-in or a phone call." };
    }
    if (!input.name?.trim()) return { error: "Customer name is required." };
    if (!input.phone?.trim()) return { error: "Customer phone number is required." };
    if (!isOneOf(LEAD_PROJECT_TYPES, input.projectType)) return { error: "Unknown project type." };
    if (!isOneOf(LEAD_TIMELINES, input.timeline)) return { error: "Unknown purchase timeline." };
    if (!isOneOf(LEAD_HEARD_FROM, input.heardFrom)) return { error: "Unknown enquiry source." };

    const enquiryAt = input.enquiryAt ? new Date(input.enquiryAt) : new Date();
    if (Number.isNaN(enquiryAt.getTime())) return { error: "Enquiry date and time is not valid." };

    const leadNo = `LD-${Date.now().toString().slice(-6)}${randomBytes(1).toString("hex").toUpperCase()}`;
    const lead = await db.lead.create({
      data: {
        leadNo,
        source: input.source,
        enquiryAt,
        name: input.name.trim(),
        phone: input.phone.trim(),
        alternatePhone: clean(input.alternatePhone),
        email: clean(input.email),
        city: clean(input.city),
        address: clean(input.address),
        interests: (input.interests || []).map((i) => i.trim()).filter(Boolean),
        requirement: clean(input.requirement),
        areaSqft: positiveOrNull(input.areaSqft),
        budget: positiveOrNull(input.budget),
        projectType: clean(input.projectType),
        timeline: clean(input.timeline),
        heardFrom: clean(input.heardFrom),
        status: input.nextFollowUpDate ? "FOLLOW_UP" : "NEW",
        nextFollowUpDate: input.nextFollowUpDate || null,
        notes: clean(input.notes),
        assignedToId: clean(input.assignedToId),
        createdById: session.user.id,
      },
    });

    revalidatePath("/leads");
    return { success: true, data: { id: lead.id, leadNo: lead.leadNo } };
  } catch (error: any) {
    console.error("Error creating lead:", error);
    return { error: error.message || "Failed to save the enquiry" };
  }
}

export async function updateLeadAction(id: string, input: UpdateLeadInput) {
  const denied = await denyUnlessCan("leads:update");
  if (denied) return denied;
  try {
    if (!isOneOf(LEAD_STATUSES, input.status)) return { error: "Unknown lead status." };

    const data: Record<string, unknown> = {};
    if (input.status !== undefined) data.status = input.status;
    if (input.nextFollowUpDate !== undefined) data.nextFollowUpDate = input.nextFollowUpDate || null;
    if (input.assignedToId !== undefined) data.assignedToId = input.assignedToId || null;
    if (input.notes !== undefined) data.notes = clean(input.notes);

    await db.lead.update({ where: { id }, data });
    revalidatePath("/leads");
    return { success: true };
  } catch (error: any) {
    console.error("Error updating lead:", error);
    return { error: error.message || "Failed to update the lead" };
  }
}
