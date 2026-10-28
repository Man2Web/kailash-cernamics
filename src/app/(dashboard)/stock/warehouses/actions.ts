"use server";

import { revalidatePath } from "next/cache";
import db from "@/lib/db/db";
import { authorize } from "@/lib/auth/auth";

export async function createWarehouse(name: string, code: string, branchId: string, address?: string) {
  const session = await authorize();
  if (!session) return { success: false as const, error: "Unauthorized" };
  try {
    const warehouse = await db.warehouse.create({
      data: {
        name,
        code: code.toUpperCase(),
        branchId,
        address: address || null,
      },
    });
    revalidatePath("/stock/warehouses");
    return { success: true, data: warehouse };
  } catch (error: any) {
    console.error("Error creating warehouse:", error);
    return { error: error.message || "Failed to create warehouse" };
  }
}

export async function createLocation(name: string, code: string, warehouseId: string) {
  const session = await authorize();
  if (!session) return { success: false as const, error: "Unauthorized" };
  try {
    const location = await db.warehouseLocation.create({
      data: {
        name,
        code: code.toUpperCase(),
        warehouseId,
      },
    });
    revalidatePath("/stock/warehouses");
    return { success: true, data: location };
  } catch (error: any) {
    console.error("Error creating location:", error);
    return { error: error.message || "Failed to create location" };
  }
}

export async function createRack(name: string, code: string, locationId: string) {
  const session = await authorize();
  if (!session) return { success: false as const, error: "Unauthorized" };
  try {
    const rack = await db.rack.create({
      data: {
        name,
        code: code.toUpperCase(),
        locationId,
      },
    });
    revalidatePath("/stock/warehouses");
    return { success: true, data: rack };
  } catch (error: any) {
    console.error("Error creating rack:", error);
    return { error: error.message || "Failed to create rack" };
  }
}

export async function createBin(name: string, code: string, rackId: string) {
  const session = await authorize();
  if (!session) return { success: false as const, error: "Unauthorized" };
  try {
    const bin = await db.bin.create({
      data: {
        name,
        code: code.toUpperCase(),
        rackId,
      },
    });
    revalidatePath("/stock/warehouses");
    return { success: true, data: bin };
  } catch (error: any) {
    console.error("Error creating bin:", error);
    return { error: error.message || "Failed to create bin" };
  }
}
