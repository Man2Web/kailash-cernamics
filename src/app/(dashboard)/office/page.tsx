import React from "react";
import db from "@/lib/db/db";
import OfficeClient from "@/components/erp/OfficeClient";
import { getSession, isSuperAdmin } from "@/lib/auth/auth";
import { splitRoles, toAssignableRole } from "@/lib/auth/access";
import { CUSTOM_ACCESS_PREFIX } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function formatDate(value: unknown): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN");
}

export default async function OfficePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  if (!isSuperAdmin(session.user.roles)) {
    redirect("/unauthorized");
  }

  // Fetch Users and Roles
  const users = await db.user.findMany({
    include: {
      userRoles: {
        include: {
          role: { include: { rolePermissions: { include: { permission: true } } } },
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const employees = await db.employee.findMany();
  const employeeMap = new Map<string, any>(employees.map((e: any) => [e.email?.toLowerCase() || "", e]));

  const warehouses = await db.warehouse.findMany({ orderBy: { code: "asc" } });
  const warehouseMap = new Map<string, string>(warehouses.map((w: any) => [w.id, w.name]));

  const customers = await db.customer.findMany({
    include: {
      group: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  const vendors = await db.vendor.findMany({
    orderBy: {
      name: "asc",
    },
  });

  // Format users
  const formattedUsers = users.map((u: any) => {
    const allUserRoles: any[] = u.userRoles || [];
    // Individually chosen permissions are stored on a hidden per-member role: keep it out of the visible roles.
    const customRole = allUserRoles.find((ur: any) => ur?.role?.name?.startsWith(CUSTOM_ACCESS_PREFIX));
    const customPermissions: string[] | null = customRole
      ? (customRole.role.rolePermissions || []).map((rp: any) => rp?.permission?.code).filter(Boolean)
      : null;
    const allRoles: string[] = allUserRoles
      .map((ur: any) => ur?.role?.name)
      .filter((n: any) => n && !n.startsWith(CUSTOM_ACCESS_PREFIX));
    const emp = employeeMap.get(u.email?.toLowerCase() || "");
    // Main role = the one remembered on the employee record (falls back to the highest-priority role held).
    const { primary } = splitRoles(allRoles, emp?.jobTitle);
    const roleName = allRoles.find((r) => toAssignableRole(r) === primary) || allRoles[0] || "VIEWER";
    let warehouseId = "";
    if (emp?.department && typeof emp.department === "string" && emp.department.startsWith("WH-")) {
      warehouseId = emp.department.replace("WH-", "");
    }
    const warehouseName = warehouseId ? warehouseMap.get(warehouseId) || "" : "";

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      phone: emp?.phone || "",
      employeeNo: emp?.employeeNo || "",
      role: roleName,
      roles: allRoles,
      customPermissions,
      warehouseId,
      warehouseName,
      status: u.status || "ACTIVE",
      createdAt: formatDate(u.createdAt),
    };
  });

  // Format customers
  const formattedCustomers = customers.map((c: any) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    phone: c.phone || "",
    email: c.email || "",
    gstin: c.gstin || "",
    group: c.group?.name || "Standard",
    creditLimit: Number(c.creditLimit || 0),
    outstandingAmt: Number(c.outstandingAmt || 0),
  }));

  // Format suppliers
  const formattedSuppliers = vendors.map((v: any) => ({
    id: v.id,
    code: v.code,
    name: v.name,
    phone: v.phone || "",
    email: v.email || "",
    gstin: v.gstin || "",
    outstandingAmt: Number(v.outstandingAmt || 0),
  }));

  // Format warehouses
  const formattedWarehouses = warehouses.map((w: any) => ({
    id: w.id,
    code: w.code,
    name: w.name,
    address: w.address || "",
  }));

  const isSuperAdminUser = isSuperAdmin(session.user.roles);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-base sm:text-lg lg:text-xl font-bold text-slate-900 tracking-tight leading-snug">Office Administration</h1>
        <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 leading-relaxed">
          Super Admin user management, customer relations, supplier registry, and warehouse setups
        </p>
      </div>

      <OfficeClient
        users={formattedUsers}
        customers={formattedCustomers}
        suppliers={formattedSuppliers}
        warehouses={formattedWarehouses}
        isSuperAdminUser={isSuperAdminUser}
      />
    </div>
  );
}
