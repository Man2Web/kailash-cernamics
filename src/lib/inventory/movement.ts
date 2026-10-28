import db from "@/lib/db/db";
import { randomBytes } from "crypto";
import { withAdvisoryLock } from "@/lib/db/locks";

interface TransferItem {
  productId: string;
  variantId: string;
  quantity: number;
}

export interface StockBalanceItem {
  productId: string;
  variantId: string;
  productName: string;
  sku: string;
  barcode: string;
  unit: string;
  warehouseId: string;
  warehouseName: string;
  onHand: number;
  reserved: number;
  available: number;
  inTransit: number;
  damaged: number;
  purchasePrice: number;
  sellingPrice: number;
  reorderLevel: number;
  minStock: number;
}

/**
 * Checks all active reservations and marks any past their expiry date as EXPIRED.
 * This automatically releases the reserved quantity back to available stock.
 */
export async function checkAndExpireReservations(): Promise<{ expiredCount: number }> {
  try {
    const now = new Date();
    // Query active reservation transactions
    const reservationTxns = await db.inventoryTransaction.findMany({
      where: {
        docType: "SALES_RESERVATION",
      },
    });

    let expiredCount = 0;

    for (const txn of reservationTxns) {
      if (!txn.remarks) continue;
      try {
        const metadata = JSON.parse(txn.remarks);
        if (metadata.status === "ACTIVE" && metadata.expiryDate) {
          const exp = new Date(metadata.expiryDate);
          if (exp < now) {
            // Mark as EXPIRED
            metadata.status = "EXPIRED";
            metadata.expiredAt = now.toISOString();

            await db.inventoryTransaction.update({
              where: { id: txn.id },
              data: {
                remarks: JSON.stringify(metadata),
              },
            });

            // Write RESERVATION_RELEASE audit transaction
            await db.inventoryTransaction.create({
              data: {
                docType: "RESERVATION_RELEASE",
                docId: txn.docId,
                transactionNo: `REL-${txn.transactionNo}`,
                remarks: JSON.stringify({
                  originalTransactionId: txn.id,
                  salesOrderId: metadata.salesOrderId,
                  reason: "Automatic expiry",
                  releasedAt: now.toISOString(),
                  releasedQty: metadata.quantity,
                }),
              },
            });

            // If linked to sales order, update sales order status to EXPIRED if still RESERVED
            if (metadata.salesOrderId) {
              const so = await db.salesOrder.findUnique({
                where: { id: metadata.salesOrderId },
              });
              if (so && so.status === "RESERVED") {
                await db.salesOrder.update({
                  where: { id: metadata.salesOrderId },
                  data: { status: "EXPIRED" },
                });
              }
            }

            expiredCount++;
          }
        }
      } catch {
        // Skip non-JSON remarks
      }
    }

    return { expiredCount };
  } catch (error) {
    console.error("Error running checkAndExpireReservations:", error);
    return { expiredCount: 0 };
  }
}

/**
 * Gets the active reserved quantity for each product variant and warehouse.
 */
export async function getActiveReservations(warehouseId?: string): Promise<Record<string, number>> {
  await checkAndExpireReservations();

  const reservationTxns = await db.inventoryTransaction.findMany({
    where: {
      docType: "SALES_RESERVATION",
    },
  });

  const reservedMap: Record<string, number> = {};

  for (const txn of reservationTxns) {
    if (!txn.remarks) continue;
    try {
      const meta = JSON.parse(txn.remarks);
      if (meta.status === "ACTIVE") {
        if (!warehouseId || meta.warehouseId === warehouseId) {
          const key = `${meta.variantId}_${meta.warehouseId}`;
          reservedMap[key] = (reservedMap[key] || 0) + Number(meta.quantity || 0);
        }
      }
    } catch {
      // ignore
    }
  }

  return reservedMap;
}

/**
 * Creates a stock reservation for a customer sales order.
 * Available stock = On Hand - Reserved.
 * Reserved quantity is held and NOT permanently deducted from physical on-hand stock.
 */
export async function reserveStock({
  salesOrderId,
  orderNo,
  customerName,
  variantId,
  productId,
  warehouseId,
  quantity,
  reservedDate,
  expectedPickupDate,
  expiryDate,
  notes,
}: {
  salesOrderId: string;
  orderNo: string;
  customerName: string;
  variantId: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  reservedDate?: Date;
  expectedPickupDate: Date;
  expiryDate: Date;
  notes?: string;
}) {
  const qty = Number(quantity);
  if (!variantId) throw new Error("Choose a product for every line before reserving stock.");
  if (!warehouseId) throw new Error("Choose a warehouse to reserve stock from.");
  if (!Number.isFinite(qty) || qty <= 0) throw new Error("Quantity to reserve must be greater than zero.");

  // One reservation at a time per variant+warehouse, so two orders can never both claim the last units.
  return withAdvisoryLock(`stock:${variantId}:${warehouseId}`, async () => {
    const tx: any = db;
    const variant = await tx.productVariant.findUnique({ where: { id: variantId } });
    if (!variant) throw new Error("The selected product no longer exists.");
    productId = variant.productId; // never trust the client-supplied product id
    const warehouse = await tx.warehouse.findUnique({ where: { id: warehouseId } });
    if (!warehouse) throw new Error("The selected warehouse no longer exists.");

    // 1. Verify available stock (all bins of the warehouse)
    const stockRows = await tx.stock.findMany({ where: { variantId, warehouseId } });
    const onHand = stockRows.reduce((n: number, r: any) => n + Number(r.quantity || 0), 0);
    const activeRes = await getActiveReservations(warehouseId);
    const currentlyReserved = activeRes[`${variantId}_${warehouseId}`] || 0;
    const available = onHand - currentlyReserved;

    if (available < qty) {
      throw new Error(
        `Not enough stock available to reserve. On hand: ${onHand}, already reserved: ${currentlyReserved}, available: ${Math.max(available, 0)}, requested: ${qty}.`
      );
    }

    // Duplicate protection: the same order cannot hold two active reservations for one product.
    const existing = await tx.inventoryTransaction.findMany({ where: { docType: "SALES_RESERVATION", docId: salesOrderId } });
    for (const t of existing) {
      try {
        const m = JSON.parse(t.remarks || "{}");
        if (m.status === "ACTIVE" && m.variantId === variantId && m.warehouseId === warehouseId) {
          throw new Error("This order already has an active reservation for this product.");
        }
      } catch (e: any) {
        if (e?.message?.startsWith("This order already")) throw e;
      }
    }

    const reservationNo = `RES-${Date.now().toString().slice(-6)}${randomBytes(2).toString("hex").toUpperCase()}`;
    const metadata = {
      reservationNo,
      salesOrderId,
      orderNo,
      customerName,
      productId,
      variantId,
      warehouseId,
      quantity,
      reservedDate: (reservedDate || new Date()).toISOString(),
      expectedPickupDate: expectedPickupDate.toISOString(),
      expiryDate: expiryDate.toISOString(),
      status: "ACTIVE",
      notes: notes || "",
    };

    // 2. Create reservation transaction
    const txn = await tx.inventoryTransaction.create({
      data: {
        docType: "SALES_RESERVATION",
        docId: salesOrderId,
        transactionNo: reservationNo,
        remarks: JSON.stringify(metadata),
      },
    });

    // 3. Update Sales Order status to RESERVED
    await tx.salesOrder.update({
      where: { id: salesOrderId },
      data: { status: "RESERVED" },
    });

    return { success: true, reservationNo, transactionId: txn.id };
  });
}

/**
 * Manually releases a reservation before expiry.
 */
export async function releaseReservation(transactionId: string, reason = "Manual release") {
  return db.$transaction(async (tx: any) => {
    const txn = await tx.inventoryTransaction.findUnique({
      where: { id: transactionId },
    });

    if (!txn || !txn.remarks) throw new Error("Reservation not found.");

    const meta = JSON.parse(txn.remarks);
    if (meta.status !== "ACTIVE") {
      throw new Error(`Reservation is already ${meta.status}.`);
    }

    meta.status = "CANCELLED";
    meta.releasedAt = new Date().toISOString();
    meta.releaseReason = reason;

    await tx.inventoryTransaction.update({
      where: { id: transactionId },
      data: {
        remarks: JSON.stringify(meta),
      },
    });

    await tx.inventoryTransaction.create({
      data: {
        docType: "RESERVATION_RELEASE",
        docId: meta.salesOrderId || txn.docId,
        transactionNo: `REL-${txn.transactionNo}`,
        remarks: JSON.stringify({
          originalTransactionId: txn.id,
          reason,
          releasedAt: new Date().toISOString(),
          quantity: meta.quantity,
        }),
      },
    });

    if (meta.salesOrderId) {
      // Only step a still-RESERVED order back; never revive a cancelled / completed one.
      await tx.salesOrder.updateMany({
        where: { id: meta.salesOrderId, status: "RESERVED" },
        data: { status: "CONFIRMED" },
      });
    }

    return { success: true };
  });
}

/** Releases every ACTIVE reservation held by a sales order (used when the order is cancelled / expires). */
export async function releaseReservationsForOrder(salesOrderId: string, reason: string) {
  const txns = await db.inventoryTransaction.findMany({ where: { docType: "SALES_RESERVATION", docId: salesOrderId } });
  let released = 0;
  for (const t of txns) {
    try {
      const m = JSON.parse(t.remarks || "{}");
      if (m.status !== "ACTIVE") continue;
      m.status = "CANCELLED";
      m.releasedAt = new Date().toISOString();
      m.releaseReason = reason;
      await db.inventoryTransaction.update({ where: { id: t.id }, data: { remarks: JSON.stringify(m) } });
      released++;
    } catch {
      // unreadable record: leave untouched
    }
  }
  return released;
}

/**
 * Records physical receipt of purchased stock (Purchase Delivery / GRN).
 * Increases physical stock and logs PURCHASE_RECEIPT movement.
 */
export async function recordStockReceipt({
  grnId,
  grnNo,
  warehouseId,
  items,
  remarks,
}: {
  grnId: string;
  grnNo: string;
  warehouseId: string;
  items: Array<{ productId: string; variantId: string; quantity: number; binId?: string }>;
  remarks?: string;
}) {
  return db.$transaction(async (tx: any) => {
    // 1. Write Inventory Transaction Header
    const transaction = await tx.inventoryTransaction.create({
      data: {
        docType: "PURCHASE_RECEIPT",
        docId: grnId,
        transactionNo: grnNo,
        remarks: remarks || `Stock received from Purchase Delivery ${grnNo}`,
      },
    });

    for (const item of items) {
      if (item.quantity <= 0) continue;

      const existingStock = await tx.stock.findFirst({
        where: {
          variantId: item.variantId,
          warehouseId,
          binId: item.binId || null,
        },
      });

      if (existingStock) {
        await tx.stock.update({
          where: { id: existingStock.id },
          data: {
            quantity: Number(existingStock.quantity) + item.quantity,
          },
        });
      } else {
        await tx.stock.create({
          data: {
            productId: item.productId,
            variantId: item.variantId,
            warehouseId,
            binId: item.binId || undefined,
            quantity: item.quantity,
          },
        });
      }

      // Write inbound ledger line
      await tx.inventoryLedger.create({
        data: {
          transactionId: transaction.id,
          variantId: item.variantId,
          warehouseId,
          binId: item.binId || undefined,
          quantity: item.quantity,
        },
      });
    }

    return { success: true, transactionId: transaction.id };
  });
}

/**
 * Records stock dispatch for customer deliveries.
 * Deducts physical stock and logs DELIVERY_DISPATCH movement.
 */
export async function recordDeliveryDispatch({
  dispatchId,
  dispatchNo,
  warehouseId,
  items,
  salesOrderId,
  remarks,
}: {
  dispatchId: string;
  dispatchNo: string;
  warehouseId: string;
  items: Array<{ variantId: string; quantity: number; binId?: string }>;
  salesOrderId?: string;
  remarks?: string;
}) {
  return db.$transaction(async (tx: any) => {
    const transaction = await tx.inventoryTransaction.create({
      data: {
        docType: "DELIVERY_DISPATCH",
        docId: dispatchId,
        transactionNo: dispatchNo,
        remarks: remarks || `Dispatched delivery ${dispatchNo}`,
      },
    });

    for (const item of items) {
      const stockRec = await tx.stock.findFirst({
        where: {
          variantId: item.variantId,
          warehouseId,
          binId: item.binId || null,
        },
      });

      if (!stockRec || Number(stockRec.quantity) < item.quantity) {
        throw new Error(
          `Insufficient stock to dispatch. Available on hand: ${stockRec ? stockRec.quantity : 0}, Requested: ${item.quantity}`
        );
      }

      await tx.stock.update({
        where: { id: stockRec.id },
        data: {
          quantity: Number(stockRec.quantity) - item.quantity,
        },
      });

      await tx.inventoryLedger.create({
        data: {
          transactionId: transaction.id,
          variantId: item.variantId,
          warehouseId,
          binId: item.binId || undefined,
          quantity: -item.quantity,
        },
      });
    }

    // Fulfill reservation if applicable
    if (salesOrderId) {
      const activeResTxns = await tx.inventoryTransaction.findMany({
        where: {
          docType: "SALES_RESERVATION",
          docId: salesOrderId,
        },
      });

      for (const resTxn of activeResTxns) {
        if (!resTxn.remarks) continue;
        try {
          const meta = JSON.parse(resTxn.remarks);
          if (meta.status === "ACTIVE") {
            meta.status = "FULFILLED";
            meta.fulfilledAt = new Date().toISOString();
            await tx.inventoryTransaction.update({
              where: { id: resTxn.id },
              data: { remarks: JSON.stringify(meta) },
            });
          }
        } catch {
          // ignore
        }
      }
    }

    return { success: true };
  });
}

/**
 * Records a stock adjustment (physical inventory count correction) inside a database transaction.
 */
export async function recordStockAdjustment({
  productId,
  variantId,
  warehouseId,
  binId,
  physicalQty,
  currentQty,
  remarks,
}: {
  productId: string;
  variantId: string;
  warehouseId: string;
  binId?: string;
  physicalQty: number;
  currentQty: number;
  remarks?: string;
}) {
  if (!Number.isFinite(physicalQty) || physicalQty < 0) throw new Error("Counted quantity cannot be negative.");

  return withAdvisoryLock(`stock:${variantId}:${warehouseId}`, async () => {
    const tx: any = db;
    const existingStock = await tx.stock.findFirst({
      where: {
        variantId,
        warehouseId,
        binId: binId || null,
      },
    });

    // Use the live quantity, not the (possibly stale) value the form was opened with.
    const qtyChange = physicalQty - Number(existingStock?.quantity ?? 0);
    if (qtyChange === 0) return { success: true, message: "No adjustment needed (quantities match)" };

    if (existingStock) {
      await tx.stock.update({
        where: { id: existingStock.id },
        data: {
          quantity: Number(existingStock.quantity) + qtyChange,
        },
      });
    } else {
      if (physicalQty < 0) {
        throw new Error("Cannot create a new stock record with negative quantity.");
      }
      await tx.stock.create({
        data: {
          productId,
          variantId,
          warehouseId,
          binId: binId || undefined,
          quantity: physicalQty,
        },
      });
    }

    const transaction = await tx.inventoryTransaction.create({
      data: {
        docType: "STOCK_ADJUSTMENT",
        docId: variantId,
        transactionNo: `ADJ-${Date.now()}`,
        remarks: remarks || "Physical count adjustment",
      },
    });

    await tx.inventoryLedger.create({
      data: {
        transactionId: transaction.id,
        variantId,
        warehouseId,
        binId: binId || undefined,
        quantity: qtyChange,
      },
    });

    return { success: true };
  });
}

/**
 * Executes an inter-warehouse stock transfer inside a transaction.
 */
export async function recordStockTransfer({
  transferNo,
  sourceWarehouseId,
  destWarehouseId,
  items,
  remarks,
}: {
  transferNo: string;
  sourceWarehouseId: string;
  destWarehouseId: string;
  items: TransferItem[];
  remarks?: string;
}) {
  if (sourceWarehouseId === destWarehouseId) throw new Error("Source and destination warehouse must be different.");
  for (const it of items) {
    if (!Number.isFinite(it.quantity) || it.quantity <= 0) throw new Error("Transfer quantity must be greater than zero.");
  }
  return db.$transaction(async (tx: any) => {
    const reserved = await getActiveReservations(sourceWarehouseId);
    const transaction = await tx.inventoryTransaction.create({
      data: {
        docType: "TRANSFER_OUT",
        docId: sourceWarehouseId,
        transactionNo: transferNo,
        remarks: remarks || "Inter-warehouse stock transfer",
      },
    });

    for (const item of items) {
      const sourceStock = await tx.stock.findFirst({
        where: {
          variantId: item.variantId,
          warehouseId: sourceWarehouseId,
          binId: null,
        },
      });

      const free = Number(sourceStock?.quantity ?? 0) - (reserved[`${item.variantId}_${sourceWarehouseId}`] || 0);
      if (!sourceStock || free < item.quantity) {
        throw new Error(
          `Insufficient free stock in source warehouse (reserved stock cannot be moved). Free: ${Math.max(free, 0)}, requested: ${item.quantity}`
        );
      }

      await tx.stock.update({
        where: { id: sourceStock.id },
        data: {
          quantity: Number(sourceStock.quantity) - item.quantity,
        },
      });

      await tx.inventoryLedger.create({
        data: {
          transactionId: transaction.id,
          variantId: item.variantId,
          warehouseId: sourceWarehouseId,
          binId: undefined,
          quantity: -item.quantity,
        },
      });

      const destStock = await tx.stock.findFirst({
        where: {
          variantId: item.variantId,
          warehouseId: destWarehouseId,
          binId: null,
        },
      });

      if (destStock) {
        await tx.stock.update({
          where: { id: destStock.id },
          data: {
            quantity: Number(destStock.quantity) + item.quantity,
          },
        });
      } else {
        await tx.stock.create({
          data: {
            productId: item.productId,
            variantId: item.variantId,
            warehouseId: destWarehouseId,
            binId: undefined,
            quantity: item.quantity,
          },
        });
      }

      await tx.inventoryLedger.create({
        data: {
          transactionId: transaction.id,
          variantId: item.variantId,
          warehouseId: destWarehouseId,
          binId: undefined,
          quantity: item.quantity,
        },
      });
    }

    return { success: true };
  });
}

