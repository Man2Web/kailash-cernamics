import React from "react";
import db from "@/lib/db/db";
import OfficeClient from "@/components/erp/OfficeClient";
import { getSession, isSuperAdmin } from "@/lib/auth/auth";
import { loadOfficeUsers } from "@/lib/office/load-users";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function OfficePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; msg?: string }>;
}) {
  const { tab, msg } = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");

  if (!isSuperAdmin(session.user.roles)) {
    redirect("/unauthorized");
  }

  const { users: formattedUsers, warehouses } = await loadOfficeUsers();
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
        initialTab={["users", "customers", "suppliers", "warehouses"].includes(tab || "") ? (tab as any) : "users"}
        flashMessage={(msg || "").slice(0, 200)}
      />
    </div>
  );
}
