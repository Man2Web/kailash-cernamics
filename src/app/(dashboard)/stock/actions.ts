"use server";

import { denyUnlessCan } from "@/lib/auth/auth";

import { revalidatePath } from "next/cache";
import db from "@/lib/db/db";

// ==========================================
// 1. CATEGORY ACTIONS
// ==========================================

export async function createCategory(name: string, code: string) {
  const denied = await denyUnlessCan("products:manage");
  if (denied) return denied;
  try {
    const category = await db.category.create({
      data: {
        name,
        code: code.toUpperCase(),
      },
    });
    revalidatePath("/stock");
    return { success: true, data: category };
  } catch (error: any) {
    console.error("Error creating category:", error);
    return { error: error.message || "Failed to create category" };
  }
}

// ==========================================
// 2. BRAND ACTIONS
// ==========================================

export async function createBrand(name: string, code: string) {
  const denied = await denyUnlessCan("products:manage");
  if (denied) return denied;
  try {
    const brand = await db.brand.create({
      data: {
        name,
        code: code.toUpperCase(),
      },
    });
    revalidatePath("/stock");
    return { success: true, data: brand };
  } catch (error: any) {
    console.error("Error creating brand:", error);
    return { error: error.message || "Failed to create brand" };
  }
}

// ==========================================
// 3. UNIT ACTIONS
// ==========================================

export async function createUnit(name: string, code: string) {
  const denied = await denyUnlessCan("products:manage");
  if (denied) return denied;
  try {
    const unit = await db.unit.create({
      data: {
        name,
        code: code.toUpperCase(),
      },
    });
    revalidatePath("/stock");
    return { success: true, data: unit };
  } catch (error: any) {
    console.error("Error creating unit:", error);
    return { error: error.message || "Failed to create unit" };
  }
}

// ==========================================
// 4. PRODUCT ACTIONS & TRANSACTION LOGIC
// ==========================================

export interface CreateProductInput {
  name: string;
  sku: string;
  code: string;
  barcode?: string;
  categoryId: string;
  subcategoryId?: string;
  brandId?: string;
  unitId: string;
  hsnCode?: string;
  description?: string;
  purchasePrice: number;
  sellingPrice: number;
  mrp: number;
  gstRate: number;
  minStock: number;
  reorderLevel: number;
  
  // Opening stock details
  warehouseId?: string;
  binId?: string;
  openingStock?: number;
}

export async function createProduct(input: CreateProductInput) {
  const denied = await denyUnlessCan("products:create");
  if (denied) return denied;
  try {
    // Check if SKU or Code already exists
    const existingSku = await db.product.findUnique({ where: { sku: input.sku } });
    if (existingSku) return { error: "Product with this SKU already exists." };

    const existingCode = await db.product.findUnique({ where: { code: input.code } });
    if (existingCode) return { error: "Product with this Product Code already exists." };

    // Execute product creation and opening stock in a single transaction
    const result = await db.$transaction(async (tx) => {
      // 1. Create Product
      const product = await tx.product.create({
        data: {
          name: input.name,
          sku: input.sku,
          code: input.code,
          categoryId: input.categoryId,
          subcategoryId: input.subcategoryId || null,
          brandId: input.brandId || null,
          unitId: input.unitId,
          hsnCode: input.hsnCode || null,
          description: input.description || null,
          purchasePrice: input.purchasePrice,
          sellingPrice: input.sellingPrice,
          mrp: input.mrp,
          gstRate: input.gstRate,
          minStock: input.minStock,
          reorderLevel: input.reorderLevel,
        },
      });

      // 2. Create default variant (identical SKU)
      const variant = await tx.productVariant.create({
        data: {
          productId: product.id,
          name: "Standard",
          sku: product.sku,
          barcode: input.barcode || product.sku,
        },
      });

      // 3. Optional barcode entry
      if (input.barcode) {
        await tx.productBarcode.create({
          data: {
            productId: product.id,
            code: input.barcode,
          },
        });
      }

      // 4. Handle Opening Stock
      if (input.openingStock && input.openingStock > 0 && input.warehouseId) {
        // A. Create stock record
        const stock = await tx.stock.create({
          data: {
            productId: product.id,
            variantId: variant.id,
            warehouseId: input.warehouseId,
            binId: input.binId || null,
            quantity: input.openingStock,
          },
        });

        // B. Record Inventory Transaction
        const transaction = await tx.inventoryTransaction.create({
          data: {
            docType: "OPENING_STOCK",
            docId: product.id,
            transactionNo: `OP-${product.code}`,
            remarks: "Opening Stock initialization",
          },
        });

        // C. Record Ledger entry
        await tx.inventoryLedger.create({
          data: {
            transactionId: transaction.id,
            variantId: variant.id,
            warehouseId: input.warehouseId,
            binId: input.binId || null,
            quantity: input.openingStock,
          },
        });
      }

      return product;
    });

    // Enqueue Tally Sync (Non-blocking for ERP)
    try {
      const { queueProductSync } = await import("@/lib/tally/sync-service");
      await queueProductSync(result.id);
    } catch (syncErr) {
      console.warn("Tally queue product sync warning:", syncErr);
    }

    // Automatically generate and register unique permanent QR code
    try {
      const { getOrGenerateProductQr } = await import("@/lib/products/qr");
      await getOrGenerateProductQr(result.id, result.code, result.sku);
    } catch (qrErr) {
      console.warn("Product QR generation warning:", qrErr);
    }

    revalidatePath("/stock");
    return { success: true, data: result };
  } catch (error: any) {
    console.error("Error creating product transaction:", error);
    return { error: error.message || "Failed to create product" };
  }
}

// ==========================================
// 5. PRODUCT QR CODE & LIVE SCANNING ACTIONS
// ==========================================

/**
 * Server action to scan/lookup a product by QR code or Code/SKU.
 * Verifies authenticated session and returns live inventory across all warehouses.
 */
export async function getProductByQrAction(qrCodeOrQuery: string) {
  try {
    const { getSession } = await import("@/lib/auth/auth");
    const session = await getSession();
    if (!session) {
      return { error: "Authentication required. Please log in." };
    }

    if (!session.user.permissions.includes("stock:view")) {
      return { error: "Unauthorized: You do not have permission to scan or view product inventory." };
    }

    if (!qrCodeOrQuery || qrCodeOrQuery.trim().length === 0) {
      return { error: "Please provide a valid QR code or product identifier." };
    }

    const { resolveProductByQr } = await import("@/lib/products/qr");
    const result = await resolveProductByQr(qrCodeOrQuery);

    if (!result) {
      return { error: "No product found matching this QR code. Please verify the code and try again." };
    }

    return { success: true, data: result };
  } catch (error: any) {
    console.error("Error resolving product QR:", error);
    return { error: error.message || "Failed to resolve product QR code." };
  }
}

/**
 * Server action to get live stock details for a product by ID.
 */
export async function getProductStockDetailsAction(productId: string) {
  try {
    const { getSession } = await import("@/lib/auth/auth");
    const session = await getSession();
    if (!session) {
      return { error: "Authentication required." };
    }

    const { getLiveProductInventory } = await import("@/lib/products/qr");
    const result = await getLiveProductInventory(productId);

    if (!result) {
      return { error: "Product not found." };
    }

    return { success: true, data: result };
  } catch (error: any) {
    console.error("Error getting product stock details:", error);
    return { error: error.message || "Failed to retrieve product stock details." };
  }
}

/**
 * Server action for Super Admin to backfill missing QR codes for all products.
 */
export async function backfillProductQrCodesAction() {
  try {
    const { getSession, isSuperAdmin } = await import("@/lib/auth/auth");
    const session = await getSession();
    if (!session || !isSuperAdmin(session.user.roles)) {
      return { error: "Unauthorized: Only Super Admin can backfill QR codes." };
    }

    const { backfillAllProductQrCodes } = await import("@/lib/products/qr");
    const stats = await backfillAllProductQrCodes();

    revalidatePath("/stock");
    return { success: true, data: stats };
  } catch (error: any) {
    console.error("Error backfilling QR codes:", error);
    return { error: error.message || "Failed to generate QR codes." };
  }
}

