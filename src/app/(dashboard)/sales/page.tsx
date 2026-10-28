import React from "react";
import db from "@/lib/db/db";
import Link from "next/link";
import { Plus } from "lucide-react";
import SalesClient from "@/components/erp/SalesClient";
import { getSession } from "@/lib/auth/auth";
import { redirect } from "next/navigation";

// Safe Date Formatter
function formatDate(value: unknown): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleDateString("en-IN");
}

export default async function SalesDashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  
  const isSuperAdminRole = session.user.roles.includes("SUPER_ADMIN") || session.user.roles.includes("ADMIN");
  const isWarehouseMgrRole = session.user.roles.includes("WAREHOUSE_MANAGER") || session.user.roles.includes("INVENTORY_STAFF");
  const isSalesPersonRole = session.user.roles.includes("SALES_PERSON") || session.user.roles.includes("SALES_MANAGER") || session.user.roles.includes("SALES_STAFF");

  if (!isSuperAdminRole && !isWarehouseMgrRole && !isSalesPersonRole) {
    redirect("/unauthorized");
  }

  const assignedWarehouseId = (!isSuperAdminRole && isWarehouseMgrRole) ? session.user.warehouseId : undefined;
  const assignedWarehouseName = (!isSuperAdminRole && isWarehouseMgrRole) ? session.user.warehouseName : undefined;

  // 1. Fetch Sales Documents & Reservations from DB
  const { checkAndExpireReservations } = await import("@/lib/inventory/movement");
  await checkAndExpireReservations();

  const rawOrders = (await db.salesOrder.findMany({
    include: {
      customer: true,
      branch: true,
      outlet: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  })) || [];

  const rawReservations = (await db.inventoryTransaction.findMany({
    where: {
      docType: "SALES_RESERVATION",
    },
    orderBy: {
      createdAt: "desc",
    },
  })) || [];

  const customers = (await db.customer.findMany({
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
    },
    orderBy: {
      name: "asc",
    },
  })) || [];

  const products = (await db.product.findMany({
    include: {
      variants: true,
    },
    orderBy: {
      name: "asc",
    },
  })) || [];

  const warehouses = (await db.warehouse.findMany({
    where: assignedWarehouseId ? { id: assignedWarehouseId } : undefined,
    orderBy: { name: "asc" },
  })) || [];
  const branches = (await db.branch.findMany({ orderBy: { name: "asc" } })) || [];
  const outlets = (await db.outlet.findMany({ orderBy: { name: "asc" } })) || [];

  const warehouseMap = new Map(warehouses.map((w: any) => [w.id, w.name]));
  const customerMap = new Map(customers.map((c: any) => [c.id, c.name]));

  const { batchGetDocumentAuditInfo } = await import("@/lib/audit/status-history");
  const orderIds = rawOrders.map((o: any) => o.id);
  const auditMap = await batchGetDocumentAuditInfo("SALES_ORDER", orderIds);

  const formattedOrders = rawOrders.map((so: any) => {
    const orderDate = so.orderDate || so.date || so.createdAt;
    const audit = auditMap.get(so.id);

    return {
      id: so.id,
      orderNo: so.orderNo,
      customerId: so.customerId,
      customer: so.customer?.name || "Customer",
      phone: so.customer?.phone || "",
      date: formatDate(orderDate),
      status: so.status || "CONFIRMED",
      branch: so.branch?.name || "Main Branch",
      outlet: so.outlet?.name || "Main Outlet",
      createdBy: audit?.createdByName || "Not recorded",
      createdAtFormatted: audit?.createdAtFormatted || formatDate(orderDate),
      lastUpdatedBy: audit?.lastUpdatedByName || "Not recorded",
      lastUpdatedAtFormatted: audit?.lastUpdatedAtFormatted || formatDate(orderDate),
      statusHistory: audit?.statusHistory || [],
    };
  });

  const formattedReservations = rawReservations.map((r: any) => {
    let meta: any = {};
    try {
      meta = JSON.parse(r.remarks || "{}");
    } catch {
      // ignore
    }

    return {
      id: r.id,
      transactionNo: r.transactionNo,
      salesOrderId: meta.salesOrderId || r.docId,
      orderNo: meta.orderNo || "SO-REF",
      customerName: meta.customerName || "Customer",
      productName: meta.productName || "Reserved Item",
      warehouseName: warehouseMap.get(meta.warehouseId) || "Main Warehouse",
      quantity: Number(meta.quantity || 0),
      reservedDate: formatDate(meta.reservedDate || r.createdAt),
      expectedPickupDate: formatDate(meta.expectedPickupDate),
      expiryDate: formatDate(meta.expiryDate),
      status: (meta.status || "ACTIVE") as any,
    };
  });

  const scopedReservations = formattedReservations.filter((r) => {
    if (isSuperAdminRole || isSalesPersonRole) return true;
    if (!assignedWarehouseId) return true;
    return r.warehouseName === assignedWarehouseName || r.salesOrderId?.includes(assignedWarehouseId);
  });

  const formattedProducts = products.map((p: any) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    sellingPrice: Number(p.sellingPrice || 0),
    variants: (p.variants || []).map((v: any) => ({
      id: v.id,
      name: v.name,
      sku: v.sku,
    })),
  }));

  const formattedCustomers = customers.map((c: any) => ({
    id: c.id,
    name: c.name,
    phone: c.phone || "",
    email: c.email || "",
  }));

  const formattedWarehouses = warehouses.map((w: any) => ({
    id: w.id,
    name: w.name,
  }));

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-base sm:text-lg lg:text-xl font-bold text-slate-900 tracking-tight leading-snug">
            {isWarehouseMgrRole ? "Warehouse Sales Orders & Dispatch" : "Sales Orders & Reservations"}
          </h1>
          <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 leading-relaxed">
            {isWarehouseMgrRole
              ? `Manage and fulfill customer sales orders from ${session.user.warehouseName || "assigned warehouse"}`
              : "Create customer sales orders, reserve stock inventory, and coordinate delivery requests"}
          </p>
        </div>
      </div>

      <SalesClient
        invoices={[]}
        orders={formattedOrders}
        quotations={[]}
        reservations={scopedReservations}
        products={formattedProducts}
        customers={formattedCustomers}
        warehouses={formattedWarehouses}
        branches={branches}
        outlets={outlets}
        canDispatch={!isSalesPersonRole}
        isSalesPerson={isSalesPersonRole}
        isWarehouseManager={isWarehouseMgrRole}
      />
    </div>
  );
}
