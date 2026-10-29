import React from "react";
import { redirect } from "next/navigation";
import { getSession, isSuperAdmin } from "@/lib/auth/auth";
import { NewSupplierForm } from "@/components/erp/OfficeForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add New Supplier" };

export default async function NewSupplierPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!isSuperAdmin(session.user.roles)) redirect("/unauthorized");
  return <NewSupplierForm />;
}
