import React from "react";
import { redirect } from "next/navigation";
import db from "@/lib/db/db";
import { getSession, sessionCan } from "@/lib/auth/auth";
import LeadForm from "@/components/erp/LeadForm";

export const dynamic = "force-dynamic";

export default async function NewLeadPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!sessionCan(session, "leads:create")) redirect("/unauthorized");

  const categories =
    (await db.category.findMany({
      select: { name: true },
      orderBy: { name: "asc" },
    })) || [];

  const users =
    (await db.user.findMany({
      where: { status: "ACTIVE", deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    })) || [];

  // Enquiry time defaults to "now" in India time, in the format a datetime-local input expects.
  const nowLocal = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Kolkata" }).replace(" ", "T").slice(0, 16);

  return (
    <LeadForm
      categories={categories.map((c: any) => c.name)}
      users={users.map((u: any) => ({ id: u.id, name: u.name }))}
      currentUserId={session.user.id}
      defaultEnquiryAt={nowLocal}
      today={nowLocal.slice(0, 10)}
    />
  );
}
