import React from "react";
import db from "@/lib/db/db";
import MovementClient, { DeliveryItem } from "@/components/erp/MovementClient";
import { getSession, sessionCan } from "@/lib/auth/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function formatDate(value: unknown): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN");
}

export default async function MovementPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const isSuperAdminRole = session.user.roles.includes("SUPER_ADMIN") || session.user.roles.includes("ADMIN");
  const isWarehouseMgrRole = session.user.roles.includes("WAREHOUSE_MANAGER") || session.user.roles.includes("INVENTORY_STAFF");
  const isSalesPersonRole = session.user.roles.includes("SALES_PERSON") || session.user.roles.includes("SALES_MANAGER") || session.user.roles.includes("SALES_STAFF");

  if (!sessionCan(session, "movement:view")) {
    redirect("/unauthorized");
  }

  const assignedWarehouseId = (!isSuperAdminRole && isWarehouseMgrRole) ? session.user.warehouseId : undefined;
  const assignedWarehouseName = (!isSuperAdminRole && isWarehouseMgrRole) ? session.user.warehouseName : undefined;

  // 1. Fetch Sales Deliveries (Vehicle Movements)
  const allVehicleMovements = await db.vehicleMovement.findMany({
    orderBy: {
      createdAt: "desc",
    },
  });

  // Filter sales deliveries for Warehouse Manager if assigned
  const vehicleMovements = assignedWarehouseName
    ? allVehicleMovements.filter((m: any) => {
        const src = (m.sourceWarehouse || "").toLowerCase();
        const assigned = assignedWarehouseName.toLowerCase();
        return src.includes(assigned) || assigned.includes(src) || m.sourceWarehouse === assignedWarehouseId;
      })
    : allVehicleMovements;

  // Also fetch customers and sales orders to cross-reference customer phone and order details if needed
  const customers = await db.customer.findMany();
  const customerMap = new Map<string, any>();
  customers.forEach((c: any) => {
    customerMap.set(c.name.toLowerCase(), c);
    customerMap.set(c.id, c);
  });

  const warehouses = await db.warehouse.findMany({
    where: assignedWarehouseId ? { id: assignedWarehouseId } : undefined,
    orderBy: { name: "asc" },
  });
  const outlets = await db.outlet.findMany({ orderBy: { name: "asc" } });

  const { batchGetDocumentAuditInfo } = await import("@/lib/audit/status-history");
  const deliveryIds = vehicleMovements.map((m: any) => m.id);
  const auditMap = await batchGetDocumentAuditInfo("SALES_DELIVERY", deliveryIds);

  // Deliveries reference their sales order by internal id: show the order number instead.
  const looksLikeId = (v?: string | null) => !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(v);
  const refIds = Array.from(new Set(vehicleMovements.map((m: any) => m.invoiceNo).filter(looksLikeId)));
  const refOrders = refIds.length ? await db.salesOrder.findMany({ where: { id: { in: refIds } }, select: { id: true, orderNo: true } }) : [];
  const orderNoById = new Map<string, string>(refOrders.map((o: any) => [o.id, o.orderNo]));

  // Format SALES Deliveries ONLY (No purchase delivery records allowed)
  const deliveries: DeliveryItem[] = vehicleMovements.map((m: any) => {
    const rawDest = m.destOutlet || "Customer Site";
    let custPhone = "";
    const matchedCust = customerMap.get(rawDest.toLowerCase());
    if (matchedCust) {
      custPhone = matchedCust.phone || "";
    }

    const audit = auditMap.get(m.id);

    return {
      id: m.id,
      type: "SALES_DELIVERY",
      deliveryNo: m.dispatchNo || `SD-${m.id.slice(0, 6).toUpperCase()}`,
      refNo: orderNoById.get(m.invoiceNo) || m.invoiceNo || "SO-REF",
      partyName: rawDest.startsWith("Customer / ") ? rawDest.replace("Customer / ", "") : rawDest,
      partyPhone: custPhone || m.driverPhone || "",
      warehouse: m.sourceWarehouse || "Main Warehouse",
      destination: rawDest,
      driverName: m.driverName || "Assigned Driver",
      driverPhone: m.driverPhone || "",
      vehicleNo: m.vehicleNo || "N/A",
      deliveryType: m.deliveryType || "Own Vehicle",
      status: m.status || "READY_FOR_DISPATCH",
      expectedDeliveryDate: m.eta || formatDate(m.createdAt),
      actualDeliveryDate: ["DELIVERED", "COMPLETED"].includes(m.status) ? formatDate(m.updatedAt || m.createdAt) : "—",
      date: formatDate(m.createdAt),
      isLocked: m.status === "COMPLETED",
      notes: m.notes || "",
      createdByName: audit?.createdByName || "Not recorded",
      createdAtFormatted: audit?.createdAtFormatted || formatDate(m.createdAt),
      completedByName: audit?.completedByName || (m.status === "COMPLETED" ? "Recorded" : "Not recorded"),
      completedAtFormatted: audit?.completedAtFormatted || (m.status === "COMPLETED" ? formatDate(m.updatedAt) : "Not recorded"),
      statusHistory: audit?.statusHistory || [],
    };
  });

  const warehouseOptions = warehouses.map((w: any) => w.name);
  const outletOptions = outlets.map((o: any) => o.name);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-base sm:text-lg lg:text-xl font-bold text-slate-900 tracking-tight leading-snug">
          Daily Movement Tracking
        </h1>
        <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 leading-relaxed">
          {isWarehouseMgrRole
            ? `Track outbound customer sales deliveries and vehicle dispatches for ${session.user.warehouseName || "assigned warehouse"}`
            : "Operational movement tracking for customer sales deliveries, vehicle dispatches, and driver statuses"}
        </p>
      </div>

      <MovementClient
        deliveries={deliveries}
        warehouses={warehouseOptions}
        outlets={outletOptions}
        canEditStatus={sessionCan(session, "movement:update")}
      />
    </div>
  );
}
