import React from "react";
import db from "@/lib/db/db";
import { redirect } from "next/navigation";
import { getSession, isSuperAdmin } from "@/lib/auth/auth";
import { PERMISSION_GROUPS } from "@/lib/auth/permissions";
import { roleLabel } from "@/lib/auth/access";
import ProfileClient from "@/components/erp/ProfileClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Profile" };

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  const employee = await db.employee.findFirst({ where: { email: session.user.email } });
  const superAdmin = isSuperAdmin(session.user.roles);

  // What this member is allowed to open and do, grouped like the permission checklist.
  const access = PERMISSION_GROUPS.map((g) => ({
    title: g.title,
    items: g.permissions.filter((p) => superAdmin || session.user.permissions.includes(p.code)).map((p) => p.label),
  })).filter((g) => g.items.length > 0);

  return (
    <ProfileClient
      profile={{
        name: session.user.name,
        email: session.user.email,
        phone: employee?.phone || "",
        employeeNo: employee?.employeeNo || "",
        roles: session.user.roles.map(roleLabel),
        warehouse: session.user.warehouseName || "",
        status: session.user.status,
        memberSince: user?.createdAt ? new Date(user.createdAt).toLocaleDateString("en-IN") : "",
        hasEmployeeRecord: !!employee,
      }}
      access={access}
      fullAccess={superAdmin}
    />
  );
}
