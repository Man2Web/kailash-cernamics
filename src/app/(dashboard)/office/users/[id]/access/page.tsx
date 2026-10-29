import React from "react";
import { notFound, redirect } from "next/navigation";
import { getSession, isSuperAdmin } from "@/lib/auth/auth";
import { loadOfficeUsers } from "@/lib/office/load-users";
import { AccessForm } from "@/components/erp/OfficeForms";
import { splitRoles } from "@/lib/auth/access";
import { effectivePermissions } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Manage Access" };

export default async function UserAccessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  if (!isSuperAdmin(session.user.roles)) redirect("/unauthorized");

  const { users, warehouses } = await loadOfficeUsers();
  const user = users.find((u: any) => u.id === id);
  if (!user) notFound();

  const heldRoles = user.roles && user.roles.length ? user.roles : [user.role];
  const { primary } = splitRoles(heldRoles, user.role);
  return (
    <AccessForm
      user={{ id: user.id, name: user.name }}
      initialRole={primary}
      initialPermissions={user.customPermissions ?? effectivePermissions(heldRoles, null)}
      initialWarehouseId={user.warehouseId || ""}
      warehouses={warehouses.map((w: any) => ({ id: w.id, name: w.name, code: w.code }))}
    />
  );
}
