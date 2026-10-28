import React from "react";
import db from "@/lib/db/db";
import WarehouseClient from "@/components/erp/WarehouseClient";
import { getSession } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import { checkAndExpireReservations, getActiveReservations } from "@/lib/inventory/movement";

export default async function WarehousePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const isSuperAdminRole = session.user.roles.includes("SUPER_ADMIN") || session.user.roles.includes("ADMIN");
  const isWarehouseMgrRole = session.user.roles.includes("WAREHOUSE_MANAGER") || session.user.roles.includes("INVENTORY_STAFF");

  // Sales Person is strictly forbidden from /warehouse
  if (!isSuperAdminRole && !isWarehouseMgrRole) {
    redirect("/unauthorized");
  }

  // Auto-resolve assigned warehouse ID for Warehouse Manager
  let assignedWarehouseId = (!isSuperAdminRole && isWarehouseMgrRole) ? session.user.warehouseId : undefined;
  let assignedWarehouseName = (!isSuperAdminRole && isWarehouseMgrRole) ? session.user.warehouseName : undefined;

  // Fallback if warehouseId was not yet populated in session
  if (!assignedWarehouseId && isWarehouseMgrRole) {
    try {
      const emp = await db.employee.findFirst({
        where: { email: session.user.email },
      });
      if (emp?.department && emp.department.startsWith("WH-")) {
        assignedWarehouseId = emp.department.replace("WH-", "");
      }
    } catch {}
  }

  // 1. Run automatic reservation expiry check
  await checkAndExpireReservations();

  // 2. Fetch Warehouses and hierarchy
  const warehouses = await db.warehouse.findMany({
    where: assignedWarehouseId ? { id: assignedWarehouseId } : undefined,
    include: {
      branch: true,
    },
    orderBy: {
      code: "asc",
    },
  });

  const locations = await db.warehouseLocation.findMany({
    where: assignedWarehouseId ? { warehouseId: assignedWarehouseId } : undefined,
    include: {
      warehouse: true,
    },
    orderBy: {
      code: "asc",
    },
  });

  const racks = await db.rack.findMany({
    include: {
      location: {
        include: {
          warehouse: true,
        },
      },
    },
    orderBy: {
      code: "asc",
    },
  });

  const bins = await db.bin.findMany({
    include: {
      rack: {
        include: {
          location: true,
        },
      },
    },
    orderBy: {
      code: "asc",
    },
  });

  const branches = await db.branch.findMany({
    orderBy: {
      name: "asc",
    },
  });

  // 3. Fetch Stock records (scoped strictly to assigned warehouse for Warehouse Manager)
  const dbStocks = await db.stock.findMany({
    where: assignedWarehouseId ? { warehouseId: assignedWarehouseId } : undefined,
    include: {
      product: {
        include: {
          unit: true,
          category: true,
        },
      },
      variant: true,
      warehouse: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  // 4. Get active reservations
  const activeReservations = await getActiveReservations(assignedWarehouseId);

  // 5. Format stock items with On Hand, Reserved, Available (AVAILABLE = ON_HAND - RESERVED)
  const formattedStocks = dbStocks.map((s: any) => {
    const onHand = Number(s.quantity || 0);
    const varKey = `${s.variantId}_${s.warehouseId}`;
    const prodKey = `${s.productId}_${s.warehouseId}`;
    const reserved = activeReservations[varKey] || activeReservations[prodKey] || 0;
    const available = Math.max(0, onHand - reserved);

    return {
      productId: s.productId,
      variantId: s.variantId,
      name: s.product?.name || s.variant?.name || "Product",
      sku: s.variant?.sku || s.product?.sku || s.product?.code || "SKU-N/A",
      barcode: s.variant?.barcode || s.product?.code || "",
      category: s.product?.category?.name || "General",
      warehouseId: s.warehouseId,
      warehouseName: s.warehouse?.name || assignedWarehouseName || "Assigned Warehouse",
      unit: s.product?.unit?.code || "NOS",
      onHand,
      reserved,
      available,
      inTransit: 0,
      damaged: 0,
      reorderLevel: Number(s.product?.reorderLevel || 10),
    };
  });

  // 6. Fetch Relevant Sales Orders
  const rawSalesOrders = await db.salesOrder.findMany({
    include: {
      customer: true,
      branch: true,
      outlet: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 50,
  });

  const formattedSalesOrders = rawSalesOrders
    .filter((o: any) => {
      if (!assignedWarehouseName && !assignedWarehouseId) return true;
      const bName = (o.branch?.name || "").toLowerCase();
      const oName = (o.outlet?.name || "").toLowerCase();
      const aName = (assignedWarehouseName || "").toLowerCase();
      return bName.includes(aName) || oName.includes(aName) || o.branchId === assignedWarehouseId;
    })
    .map((o: any) => ({
      id: o.id,
      orderNo: o.orderNo || `SO-${o.id.slice(0, 6).toUpperCase()}`,
      customerName: o.customer?.name || "Customer",
      totalAmount: Number(o.totalAmount || 0),
      status: o.status || "CONFIRMED",
      date: o.createdAt ? new Date(o.createdAt).toLocaleDateString("en-IN") : "—",
      destination: o.outlet?.name || o.branch?.name || "Direct Delivery",
    }));

  // 7. Fetch Relevant Sales Deliveries
  const allVehicleMovements = await db.vehicleMovement.findMany({
    orderBy: {
      createdAt: "desc",
    },
    take: 50,
  });

  // Deliveries reference their sales order by internal id: show the order number instead.
  const looksLikeId = (v?: string | null) => !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(v);
  const refIds = Array.from(new Set(allVehicleMovements.map((m: any) => m.invoiceNo).filter(looksLikeId)));
  const refOrders = refIds.length ? await db.salesOrder.findMany({ where: { id: { in: refIds } }, select: { id: true, orderNo: true } }) : [];
  const orderNoById = new Map<string, string>(refOrders.map((o: any) => [o.id, o.orderNo]));

  const formattedDeliveries = allVehicleMovements
    .filter((m: any) => {
      if (!assignedWarehouseName && !assignedWarehouseId) return true;
      const src = (m.sourceWarehouse || "").toLowerCase();
      const assigned = (assignedWarehouseName || "").toLowerCase();
      return src.includes(assigned) || assigned.includes(src) || m.sourceWarehouse === assignedWarehouseId;
    })
    .map((m: any) => ({
      id: m.id,
      dispatchNo: m.dispatchNo || `SD-${m.id.slice(0, 6).toUpperCase()}`,
      refNo: orderNoById.get(m.invoiceNo) || m.invoiceNo || "SO-REF",
      destination: m.destOutlet || "Customer Site",
      driverName: m.driverName || "Driver",
      vehicleNo: m.vehicleNo || "N/A",
      status: m.status || "READY_FOR_DISPATCH",
      date: m.createdAt ? new Date(m.createdAt).toLocaleDateString("en-IN") : "—",
    }));

  return (
    <div className="space-y-6">
      <WarehouseClient
        warehouses={warehouses}
        locations={locations}
        racks={racks}
        bins={bins}
        branches={branches}
        stocks={formattedStocks}
        salesOrders={formattedSalesOrders}
        salesDeliveries={formattedDeliveries}
        assignedWarehouseId={assignedWarehouseId}
        assignedWarehouseName={assignedWarehouseName}
        isManager={isWarehouseMgrRole}
      />
    </div>
  );
}

