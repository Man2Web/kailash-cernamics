import React from "react";
import { redirect } from "next/navigation";
import { getSession, isSuperAdmin } from "@/lib/auth/auth";
import { loadOfficeUsers } from "@/lib/office/load-users";
import { NewUserForm } from "@/components/erp/OfficeForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create New User / Employee" };

export default async function NewUserPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!isSuperAdmin(session.user.roles)) redirect("/unauthorized");

  const { warehouses } = await loadOfficeUsers();
  return <NewUserForm warehouses={warehouses.map((w: any) => ({ id: w.id, name: w.name, code: w.code }))} />;
}
