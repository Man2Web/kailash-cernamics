import React from "react";
import db from "@/lib/db/db";
import PurchaseClient from "@/components/erp/PurchaseClient";
import { getSession, sessionCan } from "@/lib/auth/auth";
import { redirect } from "next/navigation";

export default async function PurchasePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  
  const isSuperAdminRole = session.user.roles.includes("SUPER_ADMIN") || session.user.roles.includes("ADMIN");
  const isWarehouseMgrRole = session.user.roles.includes("WAREHOUSE_MANAGER") || session.user.roles.includes("INVENTORY_STAFF");
  
  // Sales Person is strictly forbidden from Purchase
  if (!sessionCan(session, "purchase:view")) {
    redirect("/unauthorized");
  }

  const assignedWarehouseId = (!isSuperAdminRole && isWarehouseMgrRole) ? session.user.warehouseId : undefined;
  const assignedWarehouseName = (!isSuperAdminRole && isWarehouseMgrRole) ? session.user.warehouseName : undefined;

  // 1. Fetch Warehouses and Vendors
  const warehouses = await db.warehouse.findMany({
    orderBy: { name: "asc" },
  });
  const warehouseMap = new Map<string, string>();
  warehouses.forEach((w: any) => warehouseMap.set(w.id, w.name));

  const vendors = await db.vendor.findMany({
    include: {
      addresses: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  // 2. Fetch Purchase Orders with relations
  const allPurchaseOrders = await db.purchaseOrder.findMany({
    include: {
      vendor: true,
      branch: true,
      items: {
        include: {
          variant: {
            include: {
              product: true,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  // 3. Fetch PO Delivery Metadata from inventory_transactions
  const poMetadataTxns = await db.inventoryTransaction.findMany({
    where: {
      docType: "PO_DELIVERY_METADATA",
    },
  });

  const metadataByPoId = new Map<string, any>();
  for (const txn of poMetadataTxns) {
    if (!txn.remarks) continue;
    try {
      const parsed = JSON.parse(txn.remarks);
      if (parsed.poId) {
        metadataByPoId.set(parsed.poId, parsed);
      }
    } catch {}
  }

  function formatDate(value: unknown): string {
    if (!value) return "—";
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("en-IN");
  }

  // 4. Server-Side Scoping for Warehouse Manager
  const scopedPurchaseOrders = allPurchaseOrders.filter((po: any) => {
    if (isSuperAdminRole) return true;
    if (!assignedWarehouseId) return true;

    const meta = metadataByPoId.get(po.id);
    if (meta && meta.warehouseId) {
      return meta.warehouseId === assignedWarehouseId;
    }
    // Check branch name or warehouse name match
    const bName = (po.branch?.name || "").toLowerCase();
    const wName = (assignedWarehouseName || "").toLowerCase();
    return bName.includes(wName) || wName.includes(bName);
  });

  const { batchGetDocumentAuditInfo } = await import("@/lib/audit/status-history");
  const poIds = allPurchaseOrders.map((p: any) => p.id);
  const auditMap = await batchGetDocumentAuditInfo("PURCHASE_ORDER", poIds);

  // 5. Format PO records with full delivery tracking
  const formattedPos = scopedPurchaseOrders.map((po: any) => {
    const meta = metadataByPoId.get(po.id) || {};
    const audit = auditMap.get(po.id);
    const whId = meta.warehouseId || assignedWarehouseId || warehouses[0]?.id || "";
    const whName = warehouseMap.get(whId) || po.branch?.name || "Assigned Warehouse";

    const items = (po.items || []).map((item: any) => {
      const varId = item.variantId;
      const ordered = Number(item.quantity || 0);
      const metaItem = meta.items?.find((i: any) => i.variantId === varId);
      const received = Number(metaItem?.receivedQty || (["RECEIVED", "COMPLETED"].includes(po.status) ? ordered : 0));
      const pending = Math.max(0, ordered - received);

      return {
        productId: item.variant?.product?.id || item.variant?.productId || "",
        variantId: varId,
        name: item.variant?.product?.name || item.variant?.name || "Item",
        sku: item.variant?.sku || item.variant?.product?.sku || item.variant?.product?.code || "SKU-N/A",
        orderedQty: ordered,
        receivedQty: received,
        pendingQty: pending,
        rate: Number(item.rate || 0),
      };
    });

    const isCompleted = po.status === "COMPLETED";

    // Combine status history from audit logs and legacy meta
    const combinedStatusHistory = (audit?.statusHistory && audit.statusHistory.length > 0)
      ? audit.statusHistory
      : (meta.statusHistory || []);

    return {
      id: po.id,
      poNo: po.poNo,
      vendor: po.vendor?.name || "Vendor",
      vendorPhone: po.vendor?.phone || "",
      branch: po.branch?.name || "Main Branch",
      warehouseId: whId,
      warehouseName: whName,
      status: po.status || "ORDERED",
      expectedDeliveryDate: meta.expectedDeliveryDate || formatDate(po.createdAt),
      actualDeliveryDate: isCompleted ? (meta.actualDeliveryDate || formatDate(po.updatedAt || po.createdAt)) : (meta.actualDeliveryDate || "—"),
      driverName: meta.driverName || "—",
      driverPhone: meta.driverPhone || "",
      vehicleNo: meta.vehicleNo || "—",
      transporter: meta.transporter || "—",
      deliveryNotes: meta.notes || "",
      isLocked: isCompleted,
      date: formatDate(po.createdAt),
      items,
      createdByName: audit?.createdByName || "Not recorded",
      createdAtFormatted: audit?.createdAtFormatted || formatDate(po.createdAt),
      receivedByName: audit?.receivedByName || (meta.receivedByName || "Not recorded"),
      receivedAtFormatted: audit?.receivedAtFormatted || (meta.receivedAt ? formatDate(meta.receivedAt) : "—"),
      completedByName: audit?.completedByName || (meta.completedByName || (isCompleted ? "Not recorded" : "—")),
      completedAtFormatted: audit?.completedAtFormatted || (meta.completedAt ? formatDate(meta.completedAt) : (isCompleted ? formatDate(po.updatedAt || po.createdAt) : "—")),
      statusHistory: combinedStatusHistory,
    };
  });

  const branches = await db.branch.findMany({ orderBy: { name: "asc" } });
  const products = await db.product.findMany({
    include: {
      variants: true,
      unit: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  const formattedVendors = vendors.map((v) => ({
    id: v.id,
    code: v.code,
    name: v.name,
    gstin: v.gstin || "—",
    email: v.email || "—",
    phone: v.phone || "—",
    outstandingAmt: Number(v.outstandingAmt || 0),
    billingAddress: v.addresses?.find((a: any) => a.type === "BILLING")?.address || "—",
  }));

  const formattedProducts = products.map((p) => ({
    ...p,
    purchasePrice: Number(p.purchasePrice || 0),
    sellingPrice: Number(p.sellingPrice || 0),
    mrp: Number(p.mrp || 0),
    gstRate: Number(p.gstRate || 0),
    minStock: Number(p.minStock || 0),
    reorderLevel: Number(p.reorderLevel || 0),
    variants: (p.variants || []).map((v: any) => ({
      id: v.id,
      name: v.name,
      sku: v.sku,
    })),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-base sm:text-lg lg:text-xl font-bold text-slate-900 tracking-tight leading-snug">
          {isWarehouseMgrRole ? "Purchase Orders & Inbound Receiving" : "Purchase Orders & Procurement"}
        </h1>
        <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 leading-relaxed">
          {isWarehouseMgrRole
            ? `Manage receiving and verify inbound purchase shipments for ${session.user.warehouseName || "assigned warehouse"}`
            : "Create purchase orders, track delivery milestones, check item receipts, and manage suppliers"}
        </p>
      </div>

      <PurchaseClient
        vendors={isWarehouseMgrRole ? [] : formattedVendors}
        purchaseOrders={formattedPos}
        branches={branches}
        warehouses={warehouses.map((w: any) => ({ id: w.id, name: w.name }))}
        products={formattedProducts}
        isWarehouseManager={!sessionCan(session, "purchase:create") && !sessionCan(session, "suppliers:create")}
        canCreatePo={sessionCan(session, "purchase:create")}
        canReceive={sessionCan(session, "purchase:receive")}
        assignedWarehouseId={assignedWarehouseId}
        assignedWarehouseName={assignedWarehouseName}
      />
    </div>
  );
}
