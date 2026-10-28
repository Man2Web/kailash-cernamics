import React from "react";
import db from "@/lib/db/db";
import { Package, Plus, FolderPlus, Tag, Ruler } from "lucide-react";
import StockClient from "@/components/erp/StockClient";
import { getSession, sessionCan, warehouseScopeId } from "@/lib/auth/auth";
import { redirect } from "next/navigation";

export default async function StockPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  
  const isSuperAdminRole = session.user.roles.includes("SUPER_ADMIN") || session.user.roles.includes("ADMIN");
  const isWarehouseMgrRole = session.user.roles.includes("WAREHOUSE_MANAGER") || session.user.roles.includes("INVENTORY_STAFF");
  const isSalesPersonRole = session.user.roles.includes("SALES_PERSON") || session.user.roles.includes("SALES_MANAGER") || session.user.roles.includes("SALES_STAFF");
  // A member who also has Warehouse Manager (or Super Admin) access is not limited to the sales view.
  const isSalesOnlyRole = isSalesPersonRole && !isWarehouseMgrRole && !isSuperAdminRole;

  if (!sessionCan(session, "stock:view")) {
    redirect("/unauthorized");
  }

  const assignedWarehouseId = (!isSuperAdminRole && isWarehouseMgrRole) ? warehouseScopeId(session) : undefined;

  // 1. Fetch Master Data from PostgreSQL
  const products = await db.product.findMany({
    include: {
      category: true,
      brand: true,
      unit: true,
      stocks: true,
    },
    orderBy: {
      code: "asc",
    },
  });

  const categories = await db.category.findMany({ orderBy: { name: "asc" } });
  const brands = await db.brand.findMany({ orderBy: { name: "asc" } });
  const units = await db.unit.findMany({ orderBy: { name: "asc" } });
  const warehouses = await db.warehouse.findMany({
    where: assignedWarehouseId ? { id: assignedWarehouseId } : undefined,
    orderBy: { name: "asc" },
  });

  // Map products to include total stock quantity (scoped to assigned warehouse if applicable)
  const formattedProducts = products.map((p) => {
    const matchingStocks = assignedWarehouseId
      ? (p.stocks || []).filter((s: any) => s.warehouseId === assignedWarehouseId)
      : (p.stocks || []);
    const totalStock = matchingStocks.reduce((sum: number, s: any) => sum + Number(s.quantity || 0), 0);
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      sku: p.sku,
      hsnCode: p.hsnCode || "-",
      category: p.category?.name || "General",
      brand: p.brand?.name || "-",
      unit: p.unit?.code || "NOS",
      purchasePrice: Number(p.purchasePrice || 0),
      sellingPrice: Number(p.sellingPrice || 0),
      minStock: Number(p.minStock || 0),
      reorderLevel: Number(p.reorderLevel || 0),
      currentStock: totalStock,
    };
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-base sm:text-lg lg:text-xl font-bold text-slate-900 tracking-tight leading-snug">
            {isSalesOnlyRole ? "Stock & Product Availability" : isWarehouseMgrRole ? "Warehouse Stock Inventory" : "Stock & Product Master"}
          </h1>
          <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 leading-relaxed">
            {isSalesOnlyRole
              ? "View real-time product inventory, SKU codes, pricing, and availability to create sales orders"
              : isWarehouseMgrRole
              ? `Manage and monitor stock for ${session.user.warehouseName || "assigned warehouse"}`
              : "Manage product listings, categories, brands, measurement units, and opening stock"}
          </p>
        </div>
      </div>

      {/* Main Stock Client Component (Handles tabs and forms) */}
      <StockClient
        products={formattedProducts}
        categories={categories}
        brands={brands}
        units={units}
        warehouses={warehouses}
        viewOnly={!sessionCan(session, "products:create") && !sessionCan(session, "products:manage")}
      />
    </div>
  );
}
