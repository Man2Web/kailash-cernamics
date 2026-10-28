"use server";

import { revalidatePath } from "next/cache";
import db from "@/lib/db/db";
import { releaseReservation } from "@/lib/inventory/movement";
import { getSession, isSuperAdmin, isSalesPerson, isWarehouseManager } from "@/lib/auth/auth";

export interface SalesItemInput {
  variantId: string;
  quantity: number;
  rate: number;
  discount?: number; // discount percentage or absolute
}

// ==========================================
// 0. CUSTOMER ACTIONS
// ==========================================

export interface CreateCustomerInput {
  name: string;
  phone: string;
  alternatePhone?: string;
  email?: string;
  address?: string;
  deliveryAddress?: string;
  notes?: string;
}

export async function createCustomerAction(input: CreateCustomerInput) {
  try {
    const session = await getSession();
    if (!session) return { error: "Authentication required." };

    if (!input.name || input.name.trim().length === 0) {
      return { error: "Customer name is required." };
    }
    if (!input.phone || input.phone.trim().length === 0) {
      return { error: "Customer phone number is required." };
    }

    const code = `CUST-${Date.now().toString().slice(-6)}`;
    const customer = await db.customer.create({
      data: {
        code,
        name: input.name.trim(),
        phone: input.phone.trim(),
        email: input.email?.trim() || null,
      },
    });

    if (input.address || input.deliveryAddress) {
      try {
        await db.customerAddress.create({
          data: {
            customerId: customer.id,
            type: "SHIPPING",
            address: input.deliveryAddress || input.address || "",
            city: "",
            state: "",
            pincode: "",
          },
        });
      } catch {
        // Address is secondary
      }
    }

    revalidatePath("/sales");
    return { success: true, data: customer };
  } catch (error: any) {
    console.error("Error creating customer:", error);
    return { error: error.message || "Failed to create customer" };
  }
}

// ==========================================
// 1. QUOTATION ACTIONS
// ==========================================

export async function createQuotation(customerId: string, validDays: number, items: SalesItemInput[]) {
  try {
    if (items.length === 0) return { error: "Please add at least one item." };

    const quotationNo = `QT-${Date.now().toString().slice(-6)}`;
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + validDays);

    const result = await db.$transaction(async (tx) => {
      const quotation = await tx.quotation.create({
        data: {
          quotationNo,
          customerId,
          validUntil,
          status: "SENT",
        },
      });

      for (const item of items) {
        await tx.quotationItem.create({
          data: {
            quotationId: quotation.id,
            variantId: item.variantId,
            quantity: item.quantity,
            rate: item.rate,
            discount: item.discount || 0,
          },
        });
      }

      return quotation;
    });

    revalidatePath("/sales/quotations");
    return { success: true, data: result };
  } catch (error: any) {
    console.error("Error creating quotation:", error);
    return { error: error.message || "Failed to create quotation" };
  }
}

// ==========================================
// 2. SALES ORDER ACTIONS & RESERVATIONS
// ==========================================

export interface CreateSalesOrderInput {
  customerId: string;
  branchId: string;
  outletId: string;
  warehouseId?: string;
  salesPerson?: string;
  items: Array<SalesItemInput & { productId?: string }>;
  isReserved?: boolean;
  expectedPickupDate?: string;
  expiryDate?: string;
  notes?: string;
}

export async function createSalesOrder(input: CreateSalesOrderInput | any, ...legacyArgs: any[]) {
  try {
    const session = await getSession();
    if (!session) {
      return { error: "Authentication required. Please log in." };
    }

    // Handle both new signature and legacy positional parameters
    let customerId: string;
    let branchId: string;
    let outletId: string;
    let items: Array<SalesItemInput & { productId?: string }>;
    let isReserved = false;
    let expectedPickupDate: string | undefined;
    let expiryDate: string | undefined;
    let warehouseId: string | undefined;
    let notes = "";

    if (typeof input === "object" && input.customerId) {
      customerId = input.customerId;
      branchId = input.branchId;
      outletId = input.outletId;
      warehouseId = input.warehouseId;
      items = input.items || [];
      isReserved = !!input.isReserved;
      expectedPickupDate = input.expectedPickupDate;
      expiryDate = input.expiryDate;
      notes = input.notes || "";
    } else {
      customerId = input;
      branchId = legacyArgs[0];
      outletId = legacyArgs[1];
      items = legacyArgs[2] || [];
    }

    if (!items || items.length === 0) return { error: "Please add at least one item." };

    const orderNo = `SO-${Date.now().toString().slice(-6)}`;
    const initialStatus = isReserved ? "RESERVED" : "CONFIRMED";

    const result = await db.$transaction(async (tx: any) => {
      const order = await tx.salesOrder.create({
        data: {
          orderNo,
          customerId,
          branchId,
          outletId,
          status: initialStatus,
        },
      });

      const customer = await tx.customer.findUnique({ where: { id: customerId } });
      const customerName = customer?.name || "Customer";

      for (const item of items) {
        await tx.salesOrderItem.create({
          data: {
            orderId: order.id,
            variantId: item.variantId,
            quantity: item.quantity,
            rate: item.rate,
            discount: item.discount || 0,
          },
        });
      }

      // If stock reservation requested, create stock reservation hold
      if (isReserved && warehouseId && items.length > 0) {
        const { reserveStock } = await import("@/lib/inventory/movement");
        const pickup = expectedPickupDate ? new Date(expectedPickupDate) : new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
        const expiry = expiryDate ? new Date(expiryDate) : new Date(pickup.getTime() + 2 * 24 * 60 * 60 * 1000);

        for (const item of items) {
          await reserveStock({
            salesOrderId: order.id,
            orderNo,
            customerName,
            variantId: item.variantId,
            productId: item.productId || "",
            warehouseId,
            quantity: Number(item.quantity),
            expectedPickupDate: pickup,
            expiryDate: expiry,
            notes,
          });
        }
      }

      return order;
    });

    // Automatically record creator and initial status history from authenticated session
    const { recordDocumentStatusHistory } = await import("@/lib/audit/status-history");
    await recordDocumentStatusHistory({
      documentType: "SALES_ORDER",
      documentId: result.id,
      documentNo: orderNo,
      oldStatus: "NONE",
      newStatus: initialStatus,
      userId: session.user.id,
      userName: session.user.name,
      notes: notes || `Created by ${session.user.name}`,
      actionType: "CREATED",
    });

    revalidatePath("/sales");
    revalidatePath("/stock");
    revalidatePath("/dashboard");
    return { success: true, data: result };
  } catch (error: any) {
    console.error("Error creating sales order:", error);
    return { error: error.message || "Failed to create sales order" };
  }
}

export async function updateSalesOrderStatus(
  orderId: string,
  newStatus: string,
  reason?: string
) {
  try {
    const session = await getSession();
    if (!session) {
      return { error: "Authentication required." };
    }

    const validStatuses = [
      "DRAFT",
      "CONFIRMED",
      "RESERVED",
      "READY_FOR_DELIVERY",
      "READY_FOR_PICKUP",
      "DELIVERED",
      "COMPLETED",
      "CANCELLED",
      "EXPIRED",
    ];

    if (!validStatuses.includes(newStatus)) {
      return { error: `Invalid sales order status: ${newStatus}` };
    }

    const order = await db.salesOrder.findUnique({ where: { id: orderId } });
    if (!order) return { error: "Sales Order not found." };

    if (order.status === "COMPLETED" && newStatus !== "COMPLETED") {
      return { error: "COMPLETED orders are locked and cannot be altered." };
    }

    await db.salesOrder.update({
      where: { id: orderId },
      data: { status: newStatus },
    });

    // Automatically record status history and action performer
    const { recordDocumentStatusHistory } = await import("@/lib/audit/status-history");
    await recordDocumentStatusHistory({
      documentType: "SALES_ORDER",
      documentId: orderId,
      documentNo: order.orderNo,
      oldStatus: order.status,
      newStatus,
      userId: session.user.id,
      userName: session.user.name,
      notes: reason || "Status progression",
      actionType: newStatus === "COMPLETED" ? "COMPLETED" : "STATUS_UPDATE",
    });

    revalidatePath("/sales");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (error: any) {
    console.error("Error updating sales order status:", error);
    return { error: error.message || "Failed to update order status." };
  }
}

// ==========================================
// 3. SALES DELIVERY CREATION & WORKFLOW
// ==========================================

export interface CreateSalesDeliveryInput {
  salesOrderId?: string;
  invoiceNo?: string;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  alternatePhone?: string;
  deliveryAddress: string;
  landmark?: string;
  pincode?: string;
  sourceWarehouse: string;
  destOutlet: string;
  driverName: string;
  driverPhone?: string;
  vehicleNo: string;
  transporter?: string;
  deliveryType?: string;
  paymentStatus?: string;
  expectedDeliveryDate?: string;
  expectedDeliveryTime?: string;
  deliveryInstructions?: string;
  customerNotes?: string;
  internalNotes?: string;
  items?: Array<{ variantId: string; quantity: number }>;
}

export async function createSalesDeliveryAction(input: CreateSalesDeliveryInput) {
  try {
    const session = await getSession();
    if (!session) {
      return { error: "Authentication required." };
    }

    if (!input.driverName || !input.vehicleNo || !input.sourceWarehouse) {
      return { error: "Driver name, vehicle number, and source warehouse are required." };
    }

    const dispatchNo = `SD-${Date.now().toString().slice(-6)}`;

    const metadata = {
      dispatchNo,
      salesOrderId: input.salesOrderId || null,
      invoiceNo: input.invoiceNo || null,
      customerId: input.customerId,
      customerName: input.customerName,
      customerPhone: input.customerPhone || "",
      alternatePhone: input.alternatePhone || "",
      deliveryAddress: input.deliveryAddress,
      landmark: input.landmark || "",
      pincode: input.pincode || "",
      transporter: input.transporter || "Company Vehicle",
      deliveryType: input.deliveryType || "Own Vehicle",
      paymentStatus: input.paymentStatus || "Pending",
      expectedDeliveryDate: input.expectedDeliveryDate || new Date().toISOString().split("T")[0],
      expectedDeliveryTime: input.expectedDeliveryTime || "Standard",
      deliveryInstructions: input.deliveryInstructions || "",
      customerNotes: input.customerNotes || "",
      internalNotes: input.internalNotes || "",
      items: input.items || [],
      status: "READY_FOR_DISPATCH",
      createdById: session.user.id,
      createdByName: session.user.name,
      createdAt: new Date().toISOString(),
      isLocked: false,
    };

    const result = await db.vehicleMovement.create({
      data: {
        dispatchNo,
        invoiceNo: input.invoiceNo || input.salesOrderId || "SO-REF",
        driverName: input.driverName,
        vehicleNo: input.vehicleNo,
        sourceWarehouse: input.sourceWarehouse,
        destOutlet: input.destOutlet || input.deliveryAddress.slice(0, 30),
        status: "READY_FOR_DISPATCH",
        eta: input.expectedDeliveryDate || "Same Day",
      },
    });

    // Automatically record status history and creator
    const { recordDocumentStatusHistory } = await import("@/lib/audit/status-history");
    await recordDocumentStatusHistory({
      documentType: "SALES_DELIVERY",
      documentId: result.id,
      documentNo: dispatchNo,
      oldStatus: "NONE",
      newStatus: "READY_FOR_DISPATCH",
      userId: session.user.id,
      userName: session.user.name,
      notes: `Sales Delivery created by ${session.user.name}`,
      actionType: "CREATED",
    });

    revalidatePath("/movement");
    revalidatePath("/sales");
    return { success: true, data: result };
  } catch (error: any) {
    console.error("Error creating sales delivery:", error);
    return { error: error.message || "Failed to create sales delivery" };
  }
}

export async function updateSalesDeliveryStatus(
  deliveryId: string,
  newStatus: string,
  proofDetails?: { receivedBy?: string; notes?: string }
) {
  try {
    const session = await getSession();
    if (!session) return { error: "Authentication required." };

    const isSuper = isSuperAdmin(session.user.roles);
    const isWhMgr = session.user.roles.includes("WAREHOUSE_MANAGER") || session.user.roles.includes("INVENTORY_STAFF");

    // Sales Person cannot modify warehouse delivery status
    if (!isSuper && !isWhMgr) {
      return { error: "Unauthorized: Sales Person cannot change delivery status. Delivery status updates are restricted to Warehouse Manager / Super Admin." };
    }

    const validStatuses = [
      "DRAFT",
      "READY_FOR_DISPATCH",
      "DISPATCHED",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
      "COMPLETED",
      "READY_FOR_PICKUP",
      "PICKED_UP",
      "DELIVERY_FAILED",
      "RESCHEDULED",
      "CANCELLED",
    ];

    if (!validStatuses.includes(newStatus)) {
      return { error: `Invalid status: ${newStatus}` };
    }

    const delivery = await db.vehicleMovement.findUnique({
      where: { id: deliveryId },
    });

    if (!delivery) return { error: "Delivery not found." };

    // STRICT LOCK RULE: Completed records are permanently locked
    if (delivery.status === "COMPLETED") {
      return {
        error: "This delivery is COMPLETED and permanently locked. Status cannot be modified.",
      };
    }

    // Warehouse scoping for Warehouse Manager
    if (!isSuper && isWhMgr && session.user.warehouseName && delivery.sourceWarehouse) {
      const whName = session.user.warehouseName.toLowerCase();
      const srcWh = delivery.sourceWarehouse.toLowerCase();
      if (!srcWh.includes(whName) && !whName.includes(srcWh) && delivery.sourceWarehouse !== session.user.warehouseId) {
        return { error: "Unauthorized: You can only update deliveries dispatched from your assigned warehouse." };
      }
    }

    await db.vehicleMovement.update({
      where: { id: deliveryId },
      data: { status: newStatus },
    });

    // Automatically record status history and completion/performer
    const { recordDocumentStatusHistory } = await import("@/lib/audit/status-history");
    const notes = proofDetails?.notes || (proofDetails?.receivedBy ? `Received by: ${proofDetails.receivedBy}` : `Status changed to ${newStatus}`);
    await recordDocumentStatusHistory({
      documentType: "SALES_DELIVERY",
      documentId: deliveryId,
      documentNo: delivery.dispatchNo,
      oldStatus: delivery.status,
      newStatus,
      userId: session.user.id,
      userName: session.user.name,
      notes,
      actionType: newStatus === "COMPLETED" ? "COMPLETED" : "STATUS_UPDATE",
    });

    revalidatePath("/movement");
    revalidatePath("/sales");
    revalidatePath("/stock");
    return { success: true };
  } catch (error: any) {
    console.error("Error updating delivery status:", error);
    return { error: error.message || "Failed to update delivery status" };
  }
}

// ==========================================
// 4. CONVERSION WORKFLOWS
// ==========================================

export async function convertQuotationToOrder(quotationId: string, branchId: string, outletId: string) {
  try {
    const result = await db.$transaction(async (tx: any) => {
      // 1. Fetch Quotation
      const quotation = await tx.quotation.findUnique({
        where: { id: quotationId },
        include: { items: true },
      });

      if (!quotation) throw new Error("Quotation not found");
      if (quotation.status === "CONVERTED") throw new Error("Quotation already converted");

      // 2. Create Sales Order
      const orderNo = `SO-${Date.now().toString().slice(-6)}`;
      const order = await tx.salesOrder.create({
        data: {
          orderNo,
          customerId: quotation.customerId,
          branchId,
          outletId,
          status: "CONFIRMED",
        },
      });

      // 3. Create items
      for (const item of quotation.items) {
        await tx.salesOrderItem.create({
          data: {
            orderId: order.id,
            variantId: item.variantId,
            quantity: item.quantity,
            rate: item.rate,
            discount: item.discount,
          },
        });
      }

      // 4. Update Quotation Status
      await tx.quotation.update({
        where: { id: quotationId },
        data: { status: "CONVERTED" },
      });

      return order;
    });

    revalidatePath("/sales");
    return { success: true, data: result };
  } catch (error: any) {
    console.error("Error converting quotation:", error);
    return { error: error.message || "Failed to convert quotation" };
  }
}

// ==========================================
// 4. INVOICE ACTIONS & REAL ERP TRANSACTIONS
// ==========================================

export interface CreateInvoiceItemInput {
  variantId: string;
  warehouseId: string;
  binId?: string;
  unitId: string;
  quantity: number;
  rate: number;
  discount: number;
  taxableAmt: number;
  gstRate: number;
  cgstRate: number;
  cgstAmt: number;
  sgstRate: number;
  sgstAmt: number;
  igstRate: number;
  igstAmt: number;
  totalAmt: string;
}

export interface CreateInvoiceInput {
  salesOrderId?: string;
  customerId: string;
  branchId: string;
  outletId: string;
  docSeries?: string;
  salesLedgerId?: string;
  
  invoiceNo: string;
  invoiceDate: Date;
  dueDate: Date;
  invoiceType: string;
  natureOfTrans?: string;
  poNumber?: string;
  poDate?: Date;

  // Logistics
  ewayBillNo?: string;
  transDocNo?: string;
  transDate?: Date;
  distance?: number;
  transMode?: string;
  shippingType?: string;
  transporterName?: string;
  driverName?: string;
  driverPhone?: string;
  vehicleNo?: string;

  // Addresses
  billingAddress: string;
  billingState: string;
  billingCity: string;
  billingArea?: string;
  billingPincode: string;

  deliveryAddress: string;
  deliveryState: string;
  deliveryCity: string;
  deliveryArea?: string;
  deliveryPincode: string;

  // Totals
  noOfItems: number;
  totalQty: number;
  totalTaxable: number;
  totalDiscount: number;
  totalTax: number;
  totalPayable: number;
  roundOff: number;

  items: CreateInvoiceItemInput[];
}

export async function createInvoice(input: CreateInvoiceInput) {
  try {
    if (input.items.length === 0) return { error: "Please add at least one item to the invoice." };

    const result = await db.$transaction(async (tx) => {
      // 1. Create Invoice Record
      const invoice = await tx.invoice.create({
        data: {
          invoiceNo: input.invoiceNo,
          salesOrderId: input.salesOrderId || null,
          customerId: input.customerId,
          branchId: input.branchId,
          outletId: input.outletId,
          docSeries: input.docSeries || null,
          salesLedgerId: input.salesLedgerId || null,
          date: input.invoiceDate,
          dueDate: input.dueDate,
          invoiceType: input.invoiceType,
          natureOfTrans: input.natureOfTrans || null,
          poNumber: input.poNumber || null,
          poDate: input.poDate || null,
          
          // Transport
          ewayBillNo: input.ewayBillNo || null,
          transDocNo: input.transDocNo || null,
          transDate: input.transDate || null,
          distance: input.distance || null,
          transMode: input.transMode || null,
          shippingType: input.shippingType || null,
          transporterName: input.transporterName || null,
          driverName: input.driverName || null,
          driverPhone: input.driverPhone || null,
          vehicleNo: input.vehicleNo || null,

          // Billing
          billingAddress: input.billingAddress,
          billingState: input.billingState,
          billingCity: input.billingCity,
          billingArea: input.billingArea || null,
          billingPincode: input.billingPincode,

          // Delivery
          deliveryAddress: input.deliveryAddress,
          deliveryState: input.deliveryState,
          deliveryCity: input.deliveryCity,
          deliveryArea: input.deliveryArea || null,
          deliveryPincode: input.deliveryPincode,

          // Totals
          noOfItems: input.noOfItems,
          totalQty: input.totalQty,
          totalTaxable: input.totalTaxable,
          totalDiscount: input.totalDiscount,
          totalTax: input.totalTax,
          totalPayable: input.totalPayable,
          roundOff: input.roundOff,
          status: "APPROVED", // Auto-approved for seed simplicity
        },
      });

      // 2. Process Items, Deduct Stock & Write Inventory Ledger
      const transaction = await tx.inventoryTransaction.create({
        data: {
          docType: "INVOICE",
          docId: invoice.id,
          transactionNo: invoice.invoiceNo,
          remarks: `Sales Invoice allocation for customer ${input.customerId}`,
        },
      });

      for (const item of input.items) {
        // Create Invoice Item record
        await tx.invoiceItem.create({
          data: {
            invoiceId: invoice.id,
            variantId: item.variantId,
            warehouseId: item.warehouseId,
            binId: item.binId || null,
            unitId: item.unitId,
            quantity: item.quantity,
            rate: item.rate,
            discount: item.discount,
            taxableAmt: item.taxableAmt,
            gstRate: item.gstRate,
            cgstRate: item.cgstRate,
            cgstAmt: item.cgstAmt,
            sgstRate: item.sgstRate,
            sgstAmt: item.sgstAmt,
            igstRate: item.igstRate,
            igstAmt: item.igstAmt,
            totalAmt: item.totalAmt,
          },
        });

        // Deduct Stock Quantity
        const stock = await tx.stock.findFirst({
          where: {
            variantId: item.variantId,
            warehouseId: item.warehouseId,
            binId: item.binId || null,
          },
        });

        if (!stock || Number(stock.quantity) < item.quantity) {
          throw new Error(
            `Insufficient stock for item. Warehouse: ${item.warehouseId}. Available: ${
              stock ? stock.quantity : 0
            }, Requested: ${item.quantity}`
          );
        }

        await tx.stock.update({
          where: { id: stock.id },
          data: {
            quantity: Number(stock.quantity) - item.quantity,
          },
        });

        // Write Inventory Ledger Entry
        await tx.inventoryLedger.create({
          data: {
            transactionId: transaction.id,
            variantId: item.variantId,
            warehouseId: item.warehouseId,
            binId: item.binId || null,
            quantity: -item.quantity,
          },
        });
      }

      // 3. Update Customer Outstanding Balance
      await tx.customer.update({
        where: { id: input.customerId },
        data: {
          outstandingAmt: {
            increment: input.totalPayable,
          },
        },
      });

      // 4. Record GST Tax Transactions
      let totalCGST = 0;
      let totalSGST = 0;
      let totalIGST = 0;

      input.items.forEach((item) => {
        totalCGST += item.cgstAmt;
        totalSGST += item.sgstAmt;
        totalIGST += item.igstAmt;
      });

      if (totalCGST > 0) {
        await tx.taxTransaction.create({
          data: {
            invoiceId: invoice.id,
            taxType: "CGST",
            taxRate: 9,
            taxableAmount: input.totalTaxable,
            taxAmount: totalCGST,
          },
        });
      }
      if (totalSGST > 0) {
        await tx.taxTransaction.create({
          data: {
            invoiceId: invoice.id,
            taxType: "SGST",
            taxRate: 9,
            taxableAmount: input.totalTaxable,
            taxAmount: totalSGST,
          },
        });
      }
      if (totalIGST > 0) {
        await tx.taxTransaction.create({
          data: {
            invoiceId: invoice.id,
            taxType: "IGST",
            taxRate: 18,
            taxableAmount: input.totalTaxable,
            taxAmount: totalIGST,
          },
        });
      }

      // 5. Generate Double-entry Journal Entry
      const entryNo = `JE-INV-${Date.now().toString().slice(-6)}`;
      const journal = await tx.journalEntry.create({
        data: {
          entryNo,
          reference: invoice.id,
          description: `Sales invoice ${invoice.invoiceNo} generated.`,
        },
      });

      // Fetch chart of accounts
      const arAccount = await tx.chartOfAccount.findUnique({ where: { code: "1200" } });
      const revAccount = await tx.chartOfAccount.findUnique({ where: { code: "4100" } });
      const cgstAccount = await tx.chartOfAccount.findUnique({ where: { code: "2200" } });
      const sgstAccount = await tx.chartOfAccount.findUnique({ where: { code: "2201" } });
      const igstAccount = await tx.chartOfAccount.findUnique({ where: { code: "2202" } });

      if (arAccount && revAccount) {
        // Debit: Accounts Receivable (totalPayable)
        await tx.journalEntryItem.create({
          data: {
            entryId: journal.id,
            accountId: arAccount.id,
            debit: input.totalPayable,
            credit: 0,
          },
        });

        // Credit: Sales Revenue (totalTaxable)
        await tx.journalEntryItem.create({
          data: {
            entryId: journal.id,
            accountId: revAccount.id,
            debit: 0,
            credit: input.totalTaxable,
          },
        });

        // Credit: GST Accounts if applicable
        if (totalCGST > 0 && cgstAccount) {
          await tx.journalEntryItem.create({
            data: {
              entryId: journal.id,
              accountId: cgstAccount.id,
              debit: 0,
              credit: totalCGST,
            },
          });
        }
        if (totalSGST > 0 && sgstAccount) {
          await tx.journalEntryItem.create({
            data: {
              entryId: journal.id,
              accountId: sgstAccount.id,
              debit: 0,
              credit: totalSGST,
            },
          });
        }
        if (totalIGST > 0 && igstAccount) {
          await tx.journalEntryItem.create({
            data: {
              entryId: journal.id,
              accountId: igstAccount.id,
              debit: 0,
              credit: totalIGST,
            },
          });
        }
      }

      return invoice;
    });

    // Enqueue Tally Sync (Non-blocking for ERP)
    try {
      const { queueInvoiceSync } = await import("@/lib/tally/sync-service");
      await queueInvoiceSync(result.id);
    } catch (syncErr) {
      console.warn("Tally queue sales invoice sync warning:", syncErr);
    }

    revalidatePath("/sales");
    revalidatePath("/dashboard");
    return { success: true, data: result };
  } catch (error: any) {
    console.error("Error creating sales invoice:", error);
    return { error: error.message || "Failed to create sales invoice" };
  }
}

// ==========================================
// STOCK RESERVATIONS
// ==========================================

export async function releaseReservationAction(
  transactionId: string,
  reason = "Released by Sales Person"
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getSession();
    if (!session) return { success: false, error: "Authentication required." };

    const roles = session.user.roles;
    if (!isSuperAdmin(roles) && !isSalesPerson(roles) && !isWarehouseManager(roles)) {
      return { success: false, error: "Unauthorized: you cannot release stock reservations." };
    }

    const result = await releaseReservation(transactionId, reason);
    revalidatePath("/sales");
    return result;
  } catch (error: any) {
    console.error("Error releasing reservation:", error);
    return { success: false, error: error.message || "Failed to release reservation" };
  }
}
