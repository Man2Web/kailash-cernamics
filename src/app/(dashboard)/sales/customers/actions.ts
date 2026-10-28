"use server";

import { revalidatePath } from "next/cache";
import db from "@/lib/db/db";
import { authorize } from "@/lib/auth/auth";

export async function createCustomerGroup(name: string, discountPercent: number) {
  const session = await authorize();
  if (!session) return { success: false as const, error: "Unauthorized" };
  try {
    const group = await db.customerGroup.create({
      data: {
        name,
        discountPercent,
      },
    });
    revalidatePath("/customer");
    return { success: true, data: group };
  } catch (error: any) {
    console.error("Error creating customer group:", error);
    return { error: error.message || "Failed to create customer group" };
  }
}

export interface CreateCustomerInput {
  name: string;
  code: string;
  groupId: string;
  priceListId?: string;
  gstin?: string;
  email?: string;
  phone?: string;
  creditLimit?: number;
  
  // Optional primary addresses
  billingAddress?: {
    address: string;
    city: string;
    state: string;
    pincode: string;
    area?: string;
  };
  deliveryAddress?: {
    address: string;
    city: string;
    state: string;
    pincode: string;
    area?: string;
  };
}

export async function createCustomer(input: CreateCustomerInput) {
  const session = await authorize();
  if (!session) return { success: false as const, error: "Unauthorized" };
  try {
    const result = await db.$transaction(async (tx) => {
      // 1. Create Customer
      const customer = await tx.customer.create({
        data: {
          name: input.name,
          code: input.code.toUpperCase(),
          groupId: input.groupId,
          priceListId: input.priceListId || null,
          gstin: input.gstin || null,
          email: input.email || null,
          phone: input.phone || null,
          creditLimit: input.creditLimit || 0,
        },
      });

      // 2. Create Billing Address if provided
      if (input.billingAddress) {
        await tx.customerAddress.create({
          data: {
            customerId: customer.id,
            type: "BILLING",
            address: input.billingAddress.address,
            city: input.billingAddress.city,
            state: input.billingAddress.state,
            pincode: input.billingAddress.pincode,
            area: input.billingAddress.area || null,
            isDefault: true,
          },
        });
      }

      // 3. Create Delivery Address if provided
      if (input.deliveryAddress) {
        await tx.customerAddress.create({
          data: {
            customerId: customer.id,
            type: "SHIPPING",
            address: input.deliveryAddress.address,
            city: input.deliveryAddress.city,
            state: input.deliveryAddress.state,
            pincode: input.deliveryAddress.pincode,
            area: input.deliveryAddress.area || null,
            isDefault: true,
          },
        });
      }

      return customer;
    });

    // Enqueue Tally Sync (Non-blocking for ERP)
    try {
      const { queueCustomerSync } = await import("@/lib/tally/sync-service");
      await queueCustomerSync(result.id);
    } catch (syncErr) {
      console.warn("Tally queue customer sync warning:", syncErr);
    }

    revalidatePath("/customer");
    return { success: true, data: result };
  } catch (error: any) {
    console.error("Error creating customer:", error);
    return { error: error.message || "Failed to create customer" };
  }
}

export async function createCustomerAddress(
  customerId: string,
  type: "BILLING" | "SHIPPING" | "CUSTOM",
  address: string,
  city: string,
  state: string,
  pincode: string,
  area?: string,
  isDefault: boolean = false
) {
  const session = await authorize();
  if (!session) return { success: false as const, error: "Unauthorized" };
  try {
    const customerAddress = await db.customerAddress.create({
      data: {
        customerId,
        type,
        address,
        city,
        state,
        pincode,
        area: area || null,
        isDefault,
      },
    });
    revalidatePath("/customer");
    return { success: true, data: customerAddress };
  } catch (error: any) {
    console.error("Error creating customer address:", error);
    return { error: error.message || "Failed to create customer address" };
  }
}
