import React from "react";
import { redirect } from "next/navigation";
import { getSession, isSuperAdmin } from "@/lib/auth/auth";
import { NewCustomerForm } from "@/components/erp/OfficeForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add New Customer" };

export default async function NewCustomerPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!isSuperAdmin(session.user.roles)) redirect("/unauthorized");
  return <NewCustomerForm />;
}
