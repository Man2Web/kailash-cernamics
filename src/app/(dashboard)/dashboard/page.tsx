import React from "react";
import db from "@/lib/db/db";
import { matchesWarehouse } from "@/lib/inventory/warehouse-scope";
import { getSession, sessionCan, warehouseScopeId } from "@/lib/auth/auth";
import { firstAllowedPath } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import DashboardCharts from "@/components/charts/DashboardCharts";
import { checkAndExpireReservations, getActiveReservations } from "@/lib/inventory/movement";
import {
  Package,
  AlertTriangle,
  ShoppingCart,
  Truck,
  CheckCircle2,
  Clock,
  Boxes,
  Lock,
  Layers,
  FileSpreadsheet,
} from "lucide-react";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.user.roles.includes("ATTENDANCE_DISPLAY")) redirect("/attendance");
  if (!sessionCan(session, "dashboard:view")) {
    redirect(firstAllowedPath(session.user.permissions, false) || "/unauthorized");
  }

  const isSuperAdminRole = session.user.roles.includes("SUPER_ADMIN") || session.user.roles.includes("ADMIN");
  const isWarehouseMgrRole = session.user.roles.includes("WAREHOUSE_MANAGER") || session.user.roles.includes("INVENTORY_STAFF");
  const isSalesPersonRole = session.user.roles.includes("SALES_PERSON") || session.user.roles.includes("SALES_MANAGER") || session.user.roles.includes("SALES_STAFF");
  // A member who also has Warehouse Manager (or Super Admin) access is not limited to the sales dashboard.
  const isSalesOnlyRole = isSalesPersonRole && !isWarehouseMgrRole && !isSuperAdminRole;

  const assignedWarehouseId = (!isSuperAdminRole && isWarehouseMgrRole) ? warehouseScopeId(session) : undefined;

  // Run auto-expiry check
  await checkAndExpireReservations();

  // 1. Products & Stock Calculations
  const totalProducts = await db.product.count();

  const stockQuery = assignedWarehouseId
    ? { where: { warehouseId: assignedWarehouseId }, include: { product: true } }
    : { include: { product: true } };

  const stockLevels = await db.stock.findMany(stockQuery);

  const activeReservationsMap = await getActiveReservations(assignedWarehouseId);
  const totalReservedStock = Object.values(activeReservationsMap).reduce((sum, q) => sum + q, 0);

  let totalPhysicalStock = 0;
  let totalStockValue = 0;
  let lowStockCount = 0;

  stockLevels.forEach((item: any) => {
    const qty = Number(item.quantity || 0);
    const purchasePrice = Number(item.product?.purchasePrice || 0);
    totalPhysicalStock += qty;
    totalStockValue += qty * purchasePrice;

    if (qty <= Number(item.product?.reorderLevel || 10)) {
      lowStockCount++;
    }
  });

  const availableStock = Math.max(0, totalPhysicalStock - totalReservedStock);

  // 2. Orders & Deliveries
  const totalPurchaseOrders = isSuperAdminRole ? await db.purchaseOrder.count() : 0;
  const totalSalesOrders = await db.salesOrder.count();

  // Pending Purchase Deliveries (Goods Receipts)
  const pendingPurchaseDeliveries = isSalesOnlyRole
    ? 0
    : await db.goodsReceipt.count({
        where: {
          ...(assignedWarehouseId ? { warehouseId: assignedWarehouseId } : {}),
          status: { in: ["PENDING", "IN_TRANSIT", "ARRIVED", "RECEIVING", "EXPECTED", "DRAFT"] },
        },
      });

  // Pending Sales Deliveries (Vehicle Movements)
  const allVehicleMovements = await db.vehicleMovement.findMany({
    where: {
      status: { in: ["PENDING", "DRAFT", "READY_FOR_DISPATCH", "DISPATCHED", "OUT_FOR_DELIVERY"] },
    },
  });

  const pendingSalesDeliveries = assignedWarehouseId
    ? allVehicleMovements.filter((m: any) => matchesWarehouse(m.sourceWarehouse, assignedWarehouseId, session.user.warehouseName)).length
    : allVehicleMovements.length;

  // Completed Deliveries (Both Sales + Purchase)
  const completedSalesDeliveries = assignedWarehouseId
    ? allVehicleMovements.filter(
        (m: any) => m.status === "COMPLETED" && matchesWarehouse(m.sourceWarehouse, assignedWarehouseId, session.user.warehouseName)
      ).length
    : await db.vehicleMovement.count({ where: { status: "COMPLETED" } });
  const completedPurchaseDeliveries = isSalesOnlyRole
    ? 0
    : await db.goodsReceipt.count({
        where: {
          ...(assignedWarehouseId ? { warehouseId: assignedWarehouseId } : {}),
          status: "COMPLETED",
        },
      });
  const totalCompletedDeliveries = completedSalesDeliveries + completedPurchaseDeliveries;

  // Format currency Helper
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(val);
  };

  // Chart data (Super Admin / Admin only): real figures for the last 6 calendar months.
  const monthBuckets = Array.from({ length: 6 }, (_, k) => {
    const d = new Date(new Date().getFullYear(), new Date().getMonth() - (5 - k), 1);
    return { key: `${d.getFullYear()}-${d.getMonth()}`, name: d.toLocaleString("en-US", { month: "short" }), start: d };
  });
  const bucketKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;
  const salesByMonth = new Map<string, number>(monthBuckets.map((m) => [m.key, 0]));
  const purchasesByMonth = new Map<string, number>(monthBuckets.map((m) => [m.key, 0]));
  const stockValueByCategory = new Map<string, number>();

  if (isSuperAdminRole) {
    const since = monthBuckets[0].start;

    // Sales = invoices that are not cancelled/rejected/draft, by invoice date.
    const invoices = await db.invoice.findMany({
      where: { date: { gte: since }, deletedAt: null },
      select: { date: true, totalPayable: true, status: true },
    });
    for (const inv of invoices) {
      if (["CANCELLED", "REJECTED", "DRAFT"].includes(inv.status)) continue;
      const k = bucketKey(new Date(inv.date));
      if (salesByMonth.has(k)) salesByMonth.set(k, (salesByMonth.get(k) || 0) + Number(inv.totalPayable || 0));
    }

    // Purchases = value of non-cancelled purchase orders (quantity x rate), by order date.
    const purchaseOrders = await db.purchaseOrder.findMany({
      where: { createdAt: { gte: since } },
      include: { items: true },
    });
    for (const po of purchaseOrders) {
      if (po.status === "CANCELLED") continue;
      const k = bucketKey(new Date(po.createdAt));
      if (!purchasesByMonth.has(k)) continue;
      const value = (po.items || []).reduce((sum: number, it: any) => sum + Number(it.quantity || 0) * Number(it.rate || 0), 0);
      purchasesByMonth.set(k, (purchasesByMonth.get(k) || 0) + value);
    }

    // Stock value (quantity x purchase price) by product category.
    const categories = await db.category.findMany({});
    const categoryName = new Map<string, string>(categories.map((c: any) => [c.id, c.name]));
    stockLevels.forEach((item: any) => {
      const value = Number(item.quantity || 0) * Number(item.product?.purchasePrice || 0);
      if (value <= 0) return;
      const name = categoryName.get(item.product?.categoryId) || "Uncategorised";
      stockValueByCategory.set(name, (stockValueByCategory.get(name) || 0) + value);
    });
  }

  const salesChartData = monthBuckets.map((m) => ({ name: m.name, value: Math.round(salesByMonth.get(m.key) || 0) }));
  const purchaseChartData = monthBuckets.map((m) => ({ name: m.name, value: Math.round(purchasesByMonth.get(m.key) || 0) }));
  const categoryChartData = Array.from(stockValueByCategory.entries())
    .map(([name, value]) => ({ name, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value);

  // Role-Specific Summary Cards
  let summaryCards: Array<{
    title: string;
    value: string;
    sub: string;
    icon: any;
    color: string;
    bg: string;
  }> = [];

  if (isSalesOnlyRole) {
    summaryCards = [
      {
        title: "Sales Orders",
        value: totalSalesOrders.toLocaleString(),
        sub: "Customer orders",
        icon: ShoppingCart,
        color: "text-blue-600",
        bg: "bg-blue-50",
      },
      {
        title: "Reserved Stock",
        value: `${totalReservedStock.toLocaleString()} units`,
        sub: "Held for orders",
        icon: Lock,
        color: "text-amber-600",
        bg: "bg-amber-50",
      },
      {
        title: "Available Stock",
        value: `${availableStock.toLocaleString()} units`,
        sub: "Ready for order",
        icon: CheckCircle2,
        color: "text-emerald-600",
        bg: "bg-emerald-50",
      },
      {
        title: "Pending Sales Deliveries",
        value: String(pendingSalesDeliveries),
        sub: "Outbound to customers",
        icon: Truck,
        color: "text-purple-600",
        bg: "bg-purple-50",
      },
      {
        title: "Catalog Products",
        value: totalProducts.toLocaleString(),
        sub: "Available items",
        icon: Package,
        color: "text-sky-600",
        bg: "bg-sky-50",
      },
    ];
  } else if (isWarehouseMgrRole) {
    summaryCards = [
      {
        title: "Warehouse Stock",
        value: `${totalPhysicalStock.toLocaleString()} units`,
        sub: session.user.warehouseName || "Assigned Warehouse",
        icon: Boxes,
        color: "text-indigo-600",
        bg: "bg-indigo-50",
      },
      {
        title: "Available Stock",
        value: `${availableStock.toLocaleString()} units`,
        sub: "Free for dispatch",
        icon: CheckCircle2,
        color: "text-emerald-600",
        bg: "bg-emerald-50",
      },
      {
        title: "Reserved Stock",
        value: `${totalReservedStock.toLocaleString()} units`,
        sub: "Blocked for pickup/delivery",
        icon: Lock,
        color: "text-amber-600",
        bg: "bg-amber-50",
      },
      {
        title: "Low Stock Alert",
        value: String(lowStockCount),
        sub: "Below reorder level",
        icon: AlertTriangle,
        color: "text-rose-600",
        bg: "bg-rose-50",
      },
      {
        title: "Incoming Purchase Deliveries",
        value: String(pendingPurchaseDeliveries),
        sub: "Awaiting receiving",
        icon: Clock,
        color: "text-orange-600",
        bg: "bg-orange-50",
      },
      {
        title: "Pending Sales Dispatches",
        value: String(pendingSalesDeliveries),
        sub: "Outbound deliveries",
        icon: Truck,
        color: "text-purple-600",
        bg: "bg-purple-50",
      },
      {
        title: "Completed Deliveries",
        value: String(totalCompletedDeliveries),
        sub: "Locked records",
        icon: Layers,
        color: "text-slate-700",
        bg: "bg-slate-100",
      },
    ];
  } else {
    // SUPER ADMIN
    summaryCards = [
      {
        title: "Total Products",
        value: totalProducts.toLocaleString(),
        sub: "Active catalog",
        icon: Package,
        color: "text-blue-600",
        bg: "bg-blue-50",
      },
      {
        title: "Total Stock Value",
        value: formatCurrency(totalStockValue),
        sub: `${totalPhysicalStock} units physical`,
        icon: Boxes,
        color: "text-indigo-600",
        bg: "bg-indigo-50",
      },
      {
        title: "Available Stock",
        value: `${availableStock.toLocaleString()} units`,
        sub: "Free for sale",
        icon: CheckCircle2,
        color: "text-emerald-600",
        bg: "bg-emerald-50",
      },
      {
        title: "Reserved Stock",
        value: `${totalReservedStock.toLocaleString()} units`,
        sub: "Blocked for orders",
        icon: Lock,
        color: "text-amber-600",
        bg: "bg-amber-50",
      },
      {
        title: "Low Stock Items",
        value: String(lowStockCount),
        sub: "Below reorder level",
        icon: AlertTriangle,
        color: "text-rose-600",
        bg: "bg-rose-50",
      },
      {
        title: "Sales Orders",
        value: totalSalesOrders.toLocaleString(),
        sub: "Customer orders",
        icon: ShoppingCart,
        color: "text-sky-600",
        bg: "bg-sky-50",
      },
      {
        title: "Pending Sales Deliveries",
        value: String(pendingSalesDeliveries),
        sub: "Outbound dispatches",
        icon: Truck,
        color: "text-purple-600",
        bg: "bg-purple-50",
      },
      {
        title: "Purchase Orders",
        value: totalPurchaseOrders.toLocaleString(),
        sub: "Supplier orders",
        icon: FileSpreadsheet,
        color: "text-teal-600",
        bg: "bg-teal-50",
      },
      {
        title: "Pending Purchase Inbound",
        value: String(pendingPurchaseDeliveries),
        sub: "Goods receipts awaiting",
        icon: Clock,
        color: "text-orange-600",
        bg: "bg-orange-50",
      },
      {
        title: "Completed Deliveries",
        value: String(totalCompletedDeliveries),
        sub: "Locked records",
        icon: Layers,
        color: "text-slate-700",
        bg: "bg-slate-100",
      },
    ];
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white p-3.5 sm:p-5 border border-slate-200 rounded-lg shadow-xs">
        <div className="min-w-0">
          <h1 className="text-base sm:text-lg lg:text-xl font-bold text-slate-900 tracking-tight leading-snug">
            {isSalesOnlyRole
              ? "Sales Representative Dashboard"
              : isWarehouseMgrRole
              ? `${session.user.warehouseName || "Warehouse"} Dashboard`
              : "Company Operations Dashboard"}
          </h1>
          <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 leading-relaxed">
            {isSalesOnlyRole
              ? "Monitor customer orders, product availability, reservations, and dispatch status"
              : isWarehouseMgrRole
              ? `Operational summary for ${session.user.warehouseName || "assigned warehouse"}`
              : "Company-Wide Real-Time Stock & Logistics Summary"}
          </p>
        </div>
        <div className="flex items-center space-x-2 shrink-0">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
            ● Live System
          </span>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className={`grid grid-cols-2 md:grid-cols-3 ${isSalesOnlyRole ? "lg:grid-cols-5" : isWarehouseMgrRole ? "lg:grid-cols-4" : "lg:grid-cols-5"} gap-3`}>
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.title}
              className="bg-white p-3 sm:p-4 border border-slate-200 rounded-lg shadow-xs flex flex-col justify-between hover:border-slate-300 transition min-w-0"
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  {card.title}
                </p>
                <div className={`p-1.5 rounded ${card.bg} ${card.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900">{card.value}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{card.sub}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts Section - Only shown for Super Admin / Admin */}
      {isSuperAdminRole && (
        <DashboardCharts
          salesData={salesChartData}
          purchaseData={purchaseChartData}
          categoryData={categoryChartData}
        />
      )}
    </div>
  );
}

