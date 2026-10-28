"use server";

import { revalidatePath } from "next/cache";
import db from "@/lib/db/db";
import { getSession, isSuperAdmin, isWarehouseManager, sessionCan } from "@/lib/auth/auth";

// ==========================================
// 1. VENDOR ACTIONS
// ==========================================

export async function createVendor(
  name: string,
  code: string,
  gstin?: string,
  email?: string,
  phone?: string,
  address?: {
    address: string;
    city: string;
    state: string;
    pincode: string;
  }
) {
  try {
    const session = await getSession();
    if (!sessionCan(session, "suppliers:create")) {
      return { error: "Unauthorized: you do not have permission to register suppliers." };
    }

    const result = await db.$transaction(async (tx) => {
      const vendor = await tx.vendor.create({
        data: {
          name,
          code: code.toUpperCase(),
          gstin: gstin || null,
          email: email || null,
          phone: phone || null,
        },
      });

      if (address) {
        await tx.vendorAddress.create({
          data: {
            vendorId: vendor.id,
            type: "BILLING",
            address: address.address,
            city: address.city,
            state: address.state,
            pincode: address.pincode,
          },
        });
      }

      return vendor;
    });

    // Enqueue Tally Sync (Non-blocking for ERP)
    try {
      const { queueVendorSync } = await import("@/lib/tally/sync-service");
      await queueVendorSync(result.id);
    } catch (syncErr) {
      console.warn("Tally queue vendor sync warning:", syncErr);
    }

    revalidatePath("/purchase");
    return { success: true, data: result };
  } catch (error: any) {
    console.error("Error creating vendor:", error);
    return { error: error.message || "Failed to create vendor" };
  }
}

// ==========================================
// 2. PURCHASE ORDER ACTIONS
// ==========================================

export interface PurchaseItemInput {
  variantId: string;
  quantity: number;
  rate: number;
}

export interface CreatePurchaseOrderInput {
  vendorId: string;
  warehouseId: string;
  branchId?: string;
  items: PurchaseItemInput[];
  expectedDeliveryDate?: string;
  driverName?: string;
  driverPhone?: string;
  vehicleNo?: string;
  transporter?: string;
  notes?: string;
}

export async function createPurchaseOrder(
  vendorIdOrInput: string | CreatePurchaseOrderInput,
  branchIdOrItems?: string | PurchaseItemInput[],
  legacyItems?: PurchaseItemInput[]
) {
  try {
    const session = await getSession();
    if (!sessionCan(session, "purchase:create")) {
      return { error: "Unauthorized: you do not have permission to create purchase orders." };
    }

    let vendorId: string;
    let warehouseId: string = "";
    let branchId: string = "";
    let items: PurchaseItemInput[] = [];
    let expectedDeliveryDate = "";
    let driverName = "";
    let driverPhone = "";
    let vehicleNo = "";
    let transporter = "";
    let notes = "";

    if (typeof vendorIdOrInput === "object") {
      vendorId = vendorIdOrInput.vendorId;
      warehouseId = vendorIdOrInput.warehouseId;
      branchId = vendorIdOrInput.branchId || "";
      items = vendorIdOrInput.items || [];
      expectedDeliveryDate = vendorIdOrInput.expectedDeliveryDate || "";
      driverName = vendorIdOrInput.driverName || "";
      driverPhone = vendorIdOrInput.driverPhone || "";
      vehicleNo = vendorIdOrInput.vehicleNo || "";
      transporter = vendorIdOrInput.transporter || "";
      notes = vendorIdOrInput.notes || "";
    } else {
      vendorId = vendorIdOrInput;
      branchId = typeof branchIdOrItems === "string" ? branchIdOrItems : "";
      items = Array.isArray(branchIdOrItems) ? branchIdOrItems : legacyItems || [];
    }

    if (!vendorId) return { error: "Please select a Supplier / Vendor." };
    if (!warehouseId && !branchId) return { error: "Please select a Receiving Warehouse." };
    if (!items || items.length === 0) return { error: "Please add at least one item to the Purchase Order." };

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.variantId) return { error: `Item #${i + 1}: Product selection is required.` };
      if (item.quantity <= 0) return { error: `Item #${i + 1}: Quantity must be greater than 0.` };
      if (item.rate < 0) return { error: `Item #${i + 1}: Cost Rate cannot be negative.` };
    }

    const poNo = `PO-${Date.now().toString().slice(-6)}`;

    const result = await db.$transaction(async (tx: any) => {
      // Resolve branchId from warehouseId if needed
      if (warehouseId && !branchId) {
        const wh = await tx.warehouse.findUnique({ where: { id: warehouseId } });
        branchId = wh?.branchId || "";
      }
      if (!branchId) {
        const firstBranch = await tx.branch.findFirst();
        branchId = firstBranch?.id || "";
      }

      const po = await tx.purchaseOrder.create({
        data: {
          poNo,
          vendorId,
          branchId,
          status: "ORDERED",
        },
      });

      const formattedItemsForMeta: any[] = [];

      for (const item of items) {
        let variantId = item.variantId;
        // Verify variant existence in product_variants
        let variant = await tx.productVariant.findUnique({
          where: { id: variantId },
          include: { product: true },
        });

        if (!variant) {
          const product = await tx.product.findUnique({ where: { id: variantId } });
          if (product) {
            let pVariant = await tx.productVariant.findFirst({ where: { productId: product.id } });
            if (!pVariant) {
              pVariant = await tx.productVariant.create({
                data: {
                  productId: product.id,
                  name: "Standard",
                  sku: product.sku || product.code || product.name,
                },
              });
            }
            variantId = pVariant.id;
            variant = { ...pVariant, product };
          }
        }

        await tx.purchaseOrderItem.create({
          data: {
            poId: po.id,
            variantId: variantId,
            quantity: item.quantity,
            rate: item.rate,
          },
        });

        formattedItemsForMeta.push({
          variantId,
          productId: variant?.product?.id || "",
          productName: variant?.product?.name || variant?.name || "Product",
          orderedQty: item.quantity,
          receivedQty: 0,
          pendingQty: item.quantity,
          rate: item.rate,
        });
      }

      // Store complete delivery and receiving metadata
      await tx.inventoryTransaction.create({
        data: {
          docType: "PO_DELIVERY_METADATA",
          docId: po.id,
          transactionNo: poNo,
          remarks: JSON.stringify({
            poId: po.id,
            poNo,
            warehouseId,
            expectedDeliveryDate,
            actualDeliveryDate: "",
            driverName,
            driverPhone,
            vehicleNo,
            transporter,
            notes,
            items: formattedItemsForMeta,
            statusHistory: [
              { status: "DRAFT", timestamp: new Date().toISOString() },
              { status: "APPROVED", timestamp: new Date().toISOString() },
              { status: "ORDERED", timestamp: new Date().toISOString() },
            ],
          }),
        },
      });

      return po;
    });

    // Automatically record creator and initial status history from authenticated session
    const { recordDocumentStatusHistory } = await import("@/lib/audit/status-history");
    await recordDocumentStatusHistory({
      documentType: "PURCHASE_ORDER",
      documentId: result.id,
      documentNo: poNo,
      oldStatus: "NONE",
      newStatus: "ORDERED",
      userId: session.user.id,
      userName: session.user.name,
      notes: notes || `Purchase Order created by ${session.user.name}`,
      actionType: "CREATED",
    });

    try {
      revalidatePath("/purchase");
      revalidatePath("/warehouse");
      revalidatePath("/stock");
    } catch {
      // Ignore outside request context
    }
    return { success: true, data: result };
  } catch (error: any) {
    console.error("Error creating purchase order:", error);
    return { error: error.message || "Failed to create purchase order" };
  }
}

/**
 * Receive Purchase Order Stock (Partial or Full)
 * Warehouse Manager receives goods directly from Purchase Order.
 * Increases physical stock and logs PURCHASE_RECEIPT.
 */
export async function receivePurchaseOrderStock({
  poId,
  warehouseId,
  receivedQuantities,
  notes,
}: {
  poId: string;
  warehouseId: string;
  receivedQuantities: Record<string, number>; // variantId -> qty newly received now
  notes?: string;
}) {
  try {
    const session = await getSession();
    if (!session) return { error: "Authentication required." };

    const isSuper = isSuperAdmin(session.user.roles);
    const isWhMgr = session.user.roles.includes("WAREHOUSE_MANAGER") || session.user.roles.includes("INVENTORY_STAFF");

    if (!sessionCan(session, "purchase:receive")) {
      return { error: "Unauthorized: You do not have permission to receive purchase goods." };
    }

    // If Warehouse Manager, enforce assigned warehouse
    if (!isSuper && isWhMgr && session.user.warehouseId && warehouseId !== session.user.warehouseId) {
      return { error: "Unauthorized: You can only receive purchase goods for your assigned warehouse." };
    }

    const po = await db.purchaseOrder.findUnique({
      where: { id: poId },
      include: {
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
    });

    if (!po) return { error: "Purchase Order not found." };

    if (po.status === "COMPLETED") {
      return { error: "This Purchase Order is COMPLETED and locked against modifications." };
    }

    // Find PO metadata
    const metaTxn = await db.inventoryTransaction.findFirst({
      where: {
        docType: "PO_DELIVERY_METADATA",
        docId: poId,
      },
    });

    let currentMeta: any = { items: [], statusHistory: [] };
    if (metaTxn?.remarks) {
      try {
        currentMeta = JSON.parse(metaTxn.remarks);
      } catch {}
    }

    const { recordStockReceipt } = await import("@/lib/inventory/movement");
    const stockReceiptItems: Array<{ productId: string; variantId: string; quantity: number }> = [];

    let totalOrdered = 0;
    let totalReceived = 0;

    const updatedItemMeta = (po.items || []).map((item: any) => {
      const varId = item.variantId;
      const ordered = Number(item.quantity || 0);
      totalOrdered += ordered;

      // Previous received qty from metadata
      const prevItem = currentMeta.items?.find((i: any) => i.variantId === varId);
      const prevReceived = Number(prevItem?.receivedQty || 0);

      // New qty received in this batch
      const newlyReceived = Number(receivedQuantities[varId] || 0);
      const newTotalReceived = Math.min(ordered, prevReceived + newlyReceived);
      totalReceived += newTotalReceived;

      if (newlyReceived > 0) {
        stockReceiptItems.push({
          productId: item.variant?.product?.id || item.variant?.productId || "",
          variantId: varId,
          quantity: newlyReceived,
        });
      }

      return {
        variantId: varId,
        productId: item.variant?.product?.id || "",
        productName: item.variant?.product?.name || item.variant?.name || "Product",
        orderedQty: ordered,
        receivedQty: newTotalReceived,
        pendingQty: Math.max(0, ordered - newTotalReceived),
        rate: Number(item.rate || 0),
      };
    });

    if (stockReceiptItems.length === 0) {
      return { error: "Please enter at least 1 unit to receive." };
    }

    // Determine new status
    let nextStatus = "PARTIALLY_RECEIVED";
    if (totalReceived >= totalOrdered) {
      nextStatus = "COMPLETED";
    }

    const targetWarehouseId = warehouseId || currentMeta.warehouseId || session.user.warehouseId;

    await db.$transaction(async (tx: any) => {
      // 1. Record physical stock receipt and log PURCHASE_RECEIPT
      await recordStockReceipt({
        grnId: po.id,
        grnNo: `REC-${po.poNo}`,
        warehouseId: targetWarehouseId,
        items: stockReceiptItems,
        remarks: notes || `Stock received for ${po.poNo} into warehouse`,
      });

      // 2. Update PO status
      await tx.purchaseOrder.update({
        where: { id: poId },
        data: { status: nextStatus },
      });

      // 3. Update PO Delivery metadata
      currentMeta.warehouseId = targetWarehouseId;
      currentMeta.items = updatedItemMeta;
      if (nextStatus === "COMPLETED") {
        currentMeta.actualDeliveryDate = new Date().toLocaleDateString("en-IN");
      }
      currentMeta.statusHistory = currentMeta.statusHistory || [];
      currentMeta.statusHistory.push({
        status: nextStatus,
        timestamp: new Date().toISOString(),
        notes: `Received ${stockReceiptItems.reduce((acc, i) => acc + i.quantity, 0)} units`,
      });

      if (metaTxn) {
        await tx.inventoryTransaction.update({
          where: { id: metaTxn.id },
          data: {
            remarks: JSON.stringify(currentMeta),
          },
        });
      } else {
        await tx.inventoryTransaction.create({
          data: {
            docType: "PO_DELIVERY_METADATA",
            docId: poId,
            transactionNo: po.poNo,
            remarks: JSON.stringify(currentMeta),
          },
        });
      }
    });

    // Automatically record status history and receiving/completion employee action
    const { recordDocumentStatusHistory } = await import("@/lib/audit/status-history");
    await recordDocumentStatusHistory({
      documentType: "PURCHASE_ORDER",
      documentId: poId,
      documentNo: po.poNo,
      oldStatus: po.status,
      newStatus: nextStatus,
      userId: session.user.id,
      userName: session.user.name,
      notes: `Received ${stockReceiptItems.reduce((acc, i) => acc + i.quantity, 0)} units by ${session.user.name}` + (notes ? ` (${notes})` : ""),
      actionType: nextStatus === "COMPLETED" ? "COMPLETED" : "RECEIVED",
    });

    revalidatePath("/purchase");
    revalidatePath("/warehouse");
    revalidatePath("/stock");
    return { success: true, newStatus: nextStatus };
  } catch (error: any) {
    console.error("Error receiving PO stock:", error);
    return { error: error.message || "Failed to receive goods." };
  }
}

/**
 * Update PO Delivery Status with Valid Transitions
 */
export async function updatePurchaseOrderStatus(poId: string, newStatus: string) {
  try {
    const session = await getSession();
    if (!session) return { error: "Authentication required." };

    const isSuper = isSuperAdmin(session.user.roles);
    const isWhMgr = session.user.roles.includes("WAREHOUSE_MANAGER") || session.user.roles.includes("INVENTORY_STAFF");

    if (!sessionCan(session, "purchase:receive")) {
      return { error: "Unauthorized: You do not have permission to update purchase orders." };
    }

    const validStatuses = [
      "DRAFT",
      "APPROVED",
      "ORDERED",
      "IN_TRANSIT",
      "ARRIVED",
      "RECEIVING",
      "PARTIALLY_RECEIVED",
      "RECEIVED",
      "COMPLETED",
      "CANCELLED",
    ];

    if (!validStatuses.includes(newStatus)) {
      return { error: `Invalid status: ${newStatus}` };
    }

    const po = await db.purchaseOrder.findUnique({
      where: { id: poId },
    });

    if (!po) return { error: "Purchase Order not found." };

    // STRICT LOCK: COMPLETED PO cannot be modified
    if (po.status === "COMPLETED") {
      return { error: "This Purchase Order is COMPLETED and permanently locked." };
    }

    // Find and update metadata
    const metaTxn = await db.inventoryTransaction.findFirst({
      where: {
        docType: "PO_DELIVERY_METADATA",
        docId: poId,
      },
    });

    let currentMeta: any = {};
    if (metaTxn?.remarks) {
      try {
        currentMeta = JSON.parse(metaTxn.remarks);
      } catch {}
    }

    // If Warehouse Manager, enforce warehouse match
    if (!isSuper && isWhMgr && session.user.warehouseId && currentMeta.warehouseId && currentMeta.warehouseId !== session.user.warehouseId) {
      return { error: "Unauthorized: You can only update purchase orders for your assigned warehouse." };
    }

    await db.$transaction(async (tx: any) => {
      await tx.purchaseOrder.update({
        where: { id: poId },
        data: { status: newStatus },
      });

      currentMeta.statusHistory = currentMeta.statusHistory || [];
      currentMeta.statusHistory.push({
        status: newStatus,
        timestamp: new Date().toISOString(),
      });

      if (newStatus === "COMPLETED" || newStatus === "RECEIVED") {
        currentMeta.actualDeliveryDate = new Date().toLocaleDateString("en-IN");
      }

      if (metaTxn) {
        await tx.inventoryTransaction.update({
          where: { id: metaTxn.id },
          data: {
            remarks: JSON.stringify(currentMeta),
          },
        });
      }
    });

    // Automatically record status history and action performer
    const { recordDocumentStatusHistory } = await import("@/lib/audit/status-history");
    await recordDocumentStatusHistory({
      documentType: "PURCHASE_ORDER",
      documentId: poId,
      documentNo: po.poNo,
      oldStatus: po.status,
      newStatus,
      userId: session.user.id,
      userName: session.user.name,
      notes: `Status changed to ${newStatus} by ${session.user.name}`,
      actionType: newStatus === "COMPLETED" ? "COMPLETED" : "STATUS_UPDATE",
    });

    revalidatePath("/purchase");
    revalidatePath("/warehouse");
    revalidatePath("/stock");
    return { success: true };
  } catch (error: any) {
    console.error("Error updating Purchase Order status:", error);
    return { error: error.message || "Failed to update Purchase Order status." };
  }
}

// ==========================================
// 4. PURCHASE BILL ACTIONS & JOURNAL ENTRIES
// ==========================================

export interface PurchaseBillItemInput {
  variantId: string;
  quantity: number;
  rate: number;
  taxableAmt: number;
  gstRate: number;
  cgstAmt: number;
  sgstAmt: number;
  igstAmt: number;
}

export async function createPurchaseBill({
  poId,
  billNo,
  billingAddress,
  totalTaxable,
  totalTax,
  totalPayable,
  items,
}: {
  poId: string;
  billNo: string;
  billingAddress: string;
  totalTaxable: number;
  totalTax: number;
  totalPayable: number;
  items: PurchaseBillItemInput[];
}) {
  try {
    const result = await db.$transaction(async (tx) => {
      // 1. Fetch Purchase Order
      const po = await tx.purchaseOrder.findUnique({
        where: { id: poId },
      });

      if (!po) throw new Error("Purchase Order not found");

      // 2. Create Purchase Bill
      const bill = await tx.purchaseBill.create({
        data: {
          billNo,
          poId,
          vendorId: po.vendorId,
          branchId: po.branchId,
          billingAddress,
          totalTaxable,
          totalTax,
          totalPayable,
          status: "APPROVED",
        },
      });

      // 3. Create items
      for (const item of items) {
        await tx.purchaseBillItem.create({
          data: {
            billId: bill.id,
            variantId: item.variantId,
            quantity: item.quantity,
            rate: item.rate,
            taxableAmt: item.taxableAmt,
            gstRate: item.gstRate,
            cgstAmt: item.cgstAmt,
            sgstAmt: item.sgstAmt,
            igstAmt: item.igstAmt,
          },
        });
      }

      // 4. Update Vendor accounts payable
      const vendor = await tx.vendor.findUnique({ where: { id: po.vendorId } });
      if (vendor) {
        await tx.vendor.update({
          where: { id: po.vendorId },
          data: {
            outstandingAmt: Number(vendor.outstandingAmt || 0) + totalPayable,
          },
        });
      }

      // 5. Generate Double-entry Journal Entry for Purchase
      const entryNo = `JE-PUR-${Date.now().toString().slice(-6)}`;
      const journal = await tx.journalEntry.create({
        data: {
          entryNo,
          reference: bill.id,
          description: `Purchase Bill ${bill.billNo} generated from PO ${po.poNo}`,
        },
      });

      // Fetch chart of accounts
      const apAccount = await tx.chartOfAccount.findUnique({ where: { code: "2100" } }); // Accounts Payable
      const purAccount = await tx.chartOfAccount.findUnique({ where: { code: "5100" } }); // Purchases Account
      const inputCgst = await tx.chartOfAccount.findUnique({ where: { code: "1300" } }); // Input CGST
      const inputSgst = await tx.chartOfAccount.findUnique({ where: { code: "1301" } }); // Input SGST
      const inputIgst = await tx.chartOfAccount.findUnique({ where: { code: "1302" } }); // Input IGST

      let totalCGST = 0;
      let totalSGST = 0;
      let totalIGST = 0;

      items.forEach((item) => {
        totalCGST += item.cgstAmt;
        totalSGST += item.sgstAmt;
        totalIGST += item.igstAmt;
      });

      if (apAccount && purAccount) {
        // Credit: Accounts Payable (totalPayable)
        await tx.journalEntryItem.create({
          data: {
            entryId: journal.id,
            accountId: apAccount.id,
            debit: 0,
            credit: totalPayable,
          },
        });

        // Debit: Purchase Expense (totalTaxable)
        await tx.journalEntryItem.create({
          data: {
            entryId: journal.id,
            accountId: purAccount.id,
            debit: totalTaxable,
            credit: 0,
          },
        });

        // Debit: Input Tax Credit Accounts if applicable
        if (totalCGST > 0 && inputCgst) {
          await tx.journalEntryItem.create({
            data: {
              entryId: journal.id,
              accountId: inputCgst.id,
              debit: totalCGST,
              credit: 0,
            },
          });
        }
        if (totalSGST > 0 && inputSgst) {
          await tx.journalEntryItem.create({
            data: {
              entryId: journal.id,
              accountId: inputSgst.id,
              debit: totalSGST,
              credit: 0,
            },
          });
        }
        if (totalIGST > 0 && inputIgst) {
          await tx.journalEntryItem.create({
            data: {
              entryId: journal.id,
              accountId: inputIgst.id,
              debit: totalIGST,
              credit: 0,
            },
          });
        }
      }

      // Update Purchase Order status
      await tx.purchaseOrder.update({
        where: { id: poId },
        data: {
          status: "BILLED",
        },
      });

      return bill;
    });

    // Enqueue Tally Sync (Non-blocking for ERP)
    try {
      const { queuePurchaseBillSync } = await import("@/lib/tally/sync-service");
      await queuePurchaseBillSync(result.id);
    } catch (syncErr) {
      console.warn("Tally queue purchase bill sync warning:", syncErr);
    }

    try {
      revalidatePath("/purchase");
      revalidatePath("/finance");
    } catch {
      // Ignore outside request context
    }
    return { success: true, data: result };
  } catch (error: any) {
    console.error("Error creating purchase bill:", error);
    return { error: error.message || "Failed to create purchase bill" };
  }
}
