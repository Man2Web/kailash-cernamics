import db from "@/lib/db/db";

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
  return db.$transaction(async (tx: any) => {
    // 1. Verify available stock
    const stockRec = await tx.stock.findFirst({
      where: {
        variantId,
        warehouseId,
      },
    });

    const onHand = Number(stockRec?.quantity || 0);
    const activeRes = await getActiveReservations(warehouseId);
    const currentlyReserved = activeRes[`${variantId}_${warehouseId}`] || 0;
    const available = onHand - currentlyReserved;

    if (available < quantity) {
      throw new Error(
        `Insufficient available stock to reserve. On Hand: ${onHand}, Already Reserved: ${currentlyReserved}, Available: ${available}, Requested: ${quantity}`
      );
    }

    const reservationNo = `RES-${Date.now().toString().slice(-6)}`;
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
      await tx.salesOrder.update({
        where: { id: meta.salesOrderId },
        data: { status: "CONFIRMED" },
      });
    }

    return { success: true };
  });
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
  const qtyChange = physicalQty - currentQty;
  if (qtyChange === 0) return { success: true, message: "No adjustment needed (quantities match)" };

  return db.$transaction(async (tx: any) => {
    const existingStock = await tx.stock.findFirst({
      where: {
        variantId,
        warehouseId,
        binId: binId || null,
      },
    });

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
  return db.$transaction(async (tx: any) => {
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

      if (!sourceStock || Number(sourceStock.quantity) < item.quantity) {
        throw new Error(
          `Insufficient stock in source warehouse. Available: ${
            sourceStock ? sourceStock.quantity : 0
          }, Requested: ${item.quantity}`
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

