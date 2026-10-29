import React from "react";
import { redirect } from "next/navigation";
import db from "@/lib/db/db";
import { getSession, sessionCan } from "@/lib/auth/auth";
import LeadsClient, { type LeadRow } from "@/components/erp/LeadsClient";

export const dynamic = "force-dynamic";

function formatDateTime(value: unknown): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// DATE columns come back as UTC midnight, so the ISO date part is the stored day.
function toDateInput(value: unknown): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!sessionCan(session, "leads:view")) redirect("/unauthorized");

  const { saved } = await searchParams;

  const rawLeads =
    (await db.lead.findMany({
      include: {
        assignedTo: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { enquiryAt: "desc" },
      take: 500,
    })) || [];

  const users =
    (await db.user.findMany({
      where: { status: "ACTIVE", deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    })) || [];

  const leads: LeadRow[] = rawLeads.map((l: any) => ({
    id: l.id,
    leadNo: l.leadNo,
    source: l.source,
    enquiryAt: formatDateTime(l.enquiryAt),
    name: l.name,
    phone: l.phone,
    alternatePhone: l.alternatePhone || "",
    email: l.email || "",
    city: l.city || "",
    address: l.address || "",
    interests: l.interests || [],
    requirement: l.requirement || "",
    areaSqft: l.areaSqft ?? null,
    budget: l.budget ?? null,
    projectType: l.projectType || "",
    timeline: l.timeline || "",
    heardFrom: l.heardFrom || "",
    status: l.status,
    nextFollowUpDate: toDateInput(l.nextFollowUpDate),
    notes: l.notes || "",
    assignedToId: l.assignedToId || "",
    assignedToName: l.assignedTo?.name || "",
    createdByName: l.createdBy?.name || "Not recorded",
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-base sm:text-lg lg:text-xl font-bold text-slate-900 tracking-tight leading-snug">Leads &amp; Enquiries</h1>
        <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 leading-relaxed">
          Walk-in and phone-call enquiries, with the follow-ups due and how each one ended
        </p>
      </div>

      <LeadsClient
        leads={leads}
        users={users.map((u: any) => ({ id: u.id, name: u.name }))}
        today={new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })}
        canCreate={sessionCan(session, "leads:create")}
        canUpdate={sessionCan(session, "leads:update")}
        savedLeadNo={saved}
      />
    </div>
  );
}
