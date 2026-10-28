"use server";

import { db } from "@/lib/db/db";
import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { matchesWarehouse } from "@/lib/inventory/warehouse-scope";

export async function createMovement(formData: {
  invoiceNo: string;
  driverName: string;
  driverPhone?: string;
  vehicleNo: string;
  sourceWarehouse: string;
  destOutlet: string;
  transporter?: string;
  deliveryType?: string;
  expectedDate?: string;
  eta?: string;
  notes?: string;
}) {
  try {
    const { getSession } = await import("@/lib/auth/auth");
    const session = await getSession();
    if (!session) {
      return { success: false, error: "Authentication required." };
    }
    const { sessionCan, warehouseScopeId } = await import("@/lib/auth/auth");
    if (!sessionCan(session, "movement:update") && !sessionCan(session, "sales:dispatch")) {
      return { success: false, error: "Unauthorized: you do not have permission to create deliveries." };
    }
    const scopeId = warehouseScopeId(session);
    if (scopeId && !matchesWarehouse(formData.sourceWarehouse, scopeId, session.user.warehouseName)) {
      return { success: false, error: "You can only dispatch from your assigned warehouse." };
    }
    if (!formData.invoiceNo?.trim() || !formData.vehicleNo?.trim() || !formData.driverName?.trim()) {
      return { success: false, error: "Invoice, driver and vehicle number are required." };
    }

    const dispatchNo = `SD-${Date.now().toString().slice(-6)}${randomBytes(2).toString("hex").toUpperCase()}`;

    const metadata = {
      dispatchNo,
      invoiceNo: formData.invoiceNo,
      driverName: formData.driverName,
      driverPhone: formData.driverPhone || "",
      vehicleNo: formData.vehicleNo,
      sourceWarehouse: formData.sourceWarehouse,
      destOutlet: formData.destOutlet,
      transporter: formData.transporter || "Company Vehicle",
      deliveryType: formData.deliveryType || "Own Vehicle",
      expectedDate: formData.expectedDate || new Date().toISOString().split("T")[0],
      notes: formData.notes || "",
      status: "READY_FOR_DISPATCH",
      createdById: session.user.id,
      createdByName: session.user.name,
      createdAt: new Date().toISOString(),
      isLocked: false,
    };

    const result = await db.$transaction(async () => {
    const created = await db.vehicleMovement.create({
      data: {
        dispatchNo,
        invoiceNo: formData.invoiceNo,
        driverName: formData.driverName,
        vehicleNo: formData.vehicleNo,
        sourceWarehouse: formData.sourceWarehouse,
        destOutlet: formData.destOutlet,
        status: "READY_FOR_DISPATCH",
        eta: formData.eta || formData.expectedDate || "Same Day",
      },
    });

    await db.inventoryTransaction.create({
      data: {
        docType: "SALES_DELIVERY_LOG",
        docId: created.id,
        transactionNo: dispatchNo,
        remarks: JSON.stringify(metadata),
      },
    });

    // Record status history & creator
    const { recordDocumentStatusHistory } = await import("@/lib/audit/status-history");
    await recordDocumentStatusHistory({
      documentType: "SALES_DELIVERY",
      documentId: created.id,
      documentNo: dispatchNo,
      oldStatus: "NONE",
      newStatus: "READY_FOR_DISPATCH",
      userId: session.user.id,
      userName: session.user.name,
      notes: formData.notes || `Sales Delivery created by ${session.user.name}`,
      actionType: "CREATED",
    });
    return created;
    });

    revalidatePath("/movement");
    revalidatePath("/sales");
    return { success: true, data: result };
  } catch (error: any) {
    console.error("Error creating vehicle movement:", error);
    return { success: false, error: error.message || "Failed to create vehicle movement log." };
  }
}

export async function updateMovementStatus(id: string, status: string, eta?: string) {
  try {
    const { getSession, isSuperAdmin, sessionCan } = await import("@/lib/auth/auth");
    const session = await getSession();
    if (!session) {
      return { success: false, error: "Authentication required." };
    }

    const isSuper = isSuperAdmin(session.user.roles);
    const isWhMgr = session.user.roles.includes("WAREHOUSE_MANAGER") || session.user.roles.includes("INVENTORY_STAFF");

    if (!sessionCan(session, "movement:update")) {
      return { success: false, error: "Unauthorized: Delivery status updates are restricted to Warehouse Manager / Super Admin." };
    }

    const movement = await db.vehicleMovement.findUnique({
      where: { id },
    });

    if (!movement) {
      return { success: false, error: "Movement record not found." };
    }

    {
      const { warehouseScopeId } = await import("@/lib/auth/auth");
      const scopeId = warehouseScopeId(session);
      if (scopeId && !matchesWarehouse(movement.sourceWarehouse, scopeId, session.user.warehouseName)) {
        return { success: false, error: "You can only update deliveries from your assigned warehouse." };
      }
    }

    // STRICT LOCK RULE: Completed movements are permanently locked
    if (movement.status === "COMPLETED") {
      return {
        success: false,
        error: "This dispatch is COMPLETED and permanently locked. Status cannot be modified.",
      };
    }

    await db.$transaction(async () => {
    await db.vehicleMovement.update({
      where: { id },
      data: {
        status,
        eta: status === "COMPLETED" || status === "DELIVERED" ? "Delivered" : eta,
      },
    });

    await db.inventoryTransaction.create({
      data: {
        docType: status === "COMPLETED" ? "DISPATCH_COMPLETED" : "DISPATCH_STATUS_UPDATE",
        docId: id,
        transactionNo: `UPD-${movement.dispatchNo}`,
        remarks: JSON.stringify({
          movementId: id,
          dispatchNo: movement.dispatchNo,
          previousStatus: movement.status,
          newStatus: status,
          isLocked: status === "COMPLETED",
          updatedAt: new Date().toISOString(),
          changedById: session.user.id,
          changedByName: session.user.name,
        }),
      },
    });

    // Record status history & action performer
    const { recordDocumentStatusHistory } = await import("@/lib/audit/status-history");
    await recordDocumentStatusHistory({
      documentType: "SALES_DELIVERY",
      documentId: id,
      documentNo: movement.dispatchNo,
      oldStatus: movement.status,
      newStatus: status,
      userId: session.user.id,
      userName: session.user.name,
      notes: `Status changed to ${status} by ${session.user.name}`,
      actionType: status === "COMPLETED" ? "COMPLETED" : "STATUS_UPDATE",
    });
    });

    revalidatePath("/movement");
    revalidatePath("/sales");
    return { success: true };
  } catch (error: any) {
    console.error("Error updating movement status:", error);
    return { success: false, error: error.message || "Failed to update movement status." };
  }
}

export async function deleteMovement(id: string) {
  try {
    const { getSession, sessionCan, warehouseScopeId } = await import("@/lib/auth/auth");
    const session = await getSession();
    if (!session) return { success: false, error: "Authentication required." };
    if (!sessionCan(session, "movement:update")) {
      return { success: false, error: "Unauthorized: you do not have permission to delete deliveries." };
    }
    const movement = await db.vehicleMovement.findUnique({ where: { id } });
    if (!movement) return { success: false, error: "Not found" };
    const scopeId = warehouseScopeId(session);
    if (scopeId && !matchesWarehouse(movement.sourceWarehouse, scopeId, session.user.warehouseName)) {
      return { success: false, error: "You can only delete deliveries from your assigned warehouse." };
    }

    if (movement.status === "COMPLETED") {
      return { success: false, error: "Cannot delete a COMPLETED delivery record." };
    }

    await db.vehicleMovement.delete({
      where: { id },
    });

    revalidatePath("/movement");
    return { success: true };
  } catch (error: any) {
    console.error("Error deleting vehicle movement:", error);
    return { success: false, error: error.message || "Failed to delete vehicle movement." };
  }
}
