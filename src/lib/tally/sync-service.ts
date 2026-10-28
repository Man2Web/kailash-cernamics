import db from "@/lib/db/db";
import { enqueueSyncJob } from "./sync-queue";
import { mapCustomerToTallyLedger } from "./mappers/customer.mapper";
import { mapVendorToTallyLedger } from "./mappers/vendor.mapper";
import { mapProductToTallyStockItem } from "./mappers/product.mapper";
import { mapInvoiceToTallySalesVoucher } from "./mappers/invoice.mapper";
import { mapPurchaseBillToTallyVoucher } from "./mappers/purchase.mapper";
import { mapPaymentToTallyVoucher } from "./mappers/payment.mapper";
import { mapReceiptToTallyVoucher } from "./mappers/receipt.mapper";
import { DEFAULT_SYNC_SETTINGS } from "./config";

/**
 * Gets or initializes active connection settings
 */
export async function getActiveTallyConnection() {
  try {
    let connection = await db.tallyConnection.findFirst({
      where: { isActive: true },
    });

    if (!connection) {
      try {
        connection = await db.tallyConnection.create({
          data: {
            name: "Default TallyPrime Local",
            host: "localhost",
            port: 9000,
            protocol: "http",
            companyName: "Default Company",
            integrationMode: "BRIDGE",
            apiKey: crypto.randomUUID().replace(/-/g, ""),
            isActive: true,
            status: "CONFIGURED",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });

        await db.tallySyncSetting.create({
          data: {
            connectionId: connection.id,
            ...DEFAULT_SYNC_SETTINGS,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
      } catch (createErr) {
        console.warn("Could not auto-create Tally connection in DB:", createErr);
      }
    }

    let settings = null;
    if (connection?.id) {
      try {
        settings = await db.tallySyncSetting.findFirst({
          where: { connectionId: connection.id },
        });
      } catch (setErr) {
        console.warn("Could not fetch Tally settings:", setErr);
      }
    }

    return {
      connection: connection || {
        id: "default",
        name: "Default TallyPrime Local",
        host: "localhost",
        port: 9000,
        protocol: "http",
        companyName: "Default Company",
        integrationMode: "BRIDGE",
        apiKey: "", // no built-in key: an empty key can never authenticate a bridge request
        isActive: true,
        status: "CONFIGURED",
      },
      settings: settings || DEFAULT_SYNC_SETTINGS,
    };
  } catch (error: any) {
    console.warn("Database error in getActiveTallyConnection:", error.message);
    return {
      connection: {
        id: "default",
        name: "Default TallyPrime Local",
        host: "localhost",
        port: 9000,
        protocol: "http",
        companyName: "Default Company",
        integrationMode: "BRIDGE",
        apiKey: "", // no built-in key: an empty key can never authenticate a bridge request
        isActive: true,
        status: "CONFIGURED",
      },
      settings: DEFAULT_SYNC_SETTINGS,
      error: error.message,
    };
  }
}

/**
 * Enqueues a customer for Tally synchronization
 */
export async function queueCustomerSync(customerId: string) {
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    include: { addresses: true },
  });

  if (!customer) throw new Error(`Customer ${customerId} not found`);

  const { connection, settings } = await getActiveTallyConnection();
  if (settings && !settings.syncCustomers) {
    return { skipped: true, reason: "Customer sync disabled in settings" };
  }

  const { fullXml } = mapCustomerToTallyLedger(
    {
      id: customer.id,
      name: customer.name,
      code: customer.code,
      gstin: customer.gstin,
      email: customer.email,
      phone: customer.phone,
      creditLimit: customer.creditLimit ? Number(customer.creditLimit) : null,
      outstandingAmt: customer.outstandingAmt ? Number(customer.outstandingAmt) : 0,
      addresses: customer.addresses,
      debtorGroup: settings?.defaultDebtorGroup || "Sundry Debtors",
    },
    connection?.companyName
  );

  return enqueueSyncJob({
    entityType: "CUSTOMER",
    entityId: customer.id,
    entityCode: customer.code,
    entityName: customer.name,
    operation: "CREATE",
    payload: customer,
    xmlRequest: fullXml,
  });
}

/**
 * Enqueues a vendor for Tally synchronization
 */
export async function queueVendorSync(vendorId: string) {
  const vendor = await db.vendor.findUnique({
    where: { id: vendorId },
    include: { addresses: true },
  });

  if (!vendor) throw new Error(`Vendor ${vendorId} not found`);

  const { connection, settings } = await getActiveTallyConnection();
  if (settings && !settings.syncVendors) {
    return { skipped: true, reason: "Vendor sync disabled in settings" };
  }

  const { fullXml } = mapVendorToTallyLedger(
    {
      id: vendor.id,
      name: vendor.name,
      code: vendor.code,
      gstin: vendor.gstin,
      email: vendor.email,
      phone: vendor.phone,
      outstandingAmt: vendor.outstandingAmt ? Number(vendor.outstandingAmt) : 0,
      addresses: vendor.addresses,
      creditorGroup: settings?.defaultCreditorGroup || "Sundry Creditors",
    },
    connection?.companyName
  );

  return enqueueSyncJob({
    entityType: "VENDOR",
    entityId: vendor.id,
    entityCode: vendor.code,
    entityName: vendor.name,
    operation: "CREATE",
    payload: vendor,
    xmlRequest: fullXml,
  });
}

/**
 * Enqueues a product for Tally synchronization
 */
export async function queueProductSync(productId: string) {
  const product = await db.product.findUnique({
    where: { id: productId },
    include: { unit: true },
  });

  if (!product) throw new Error(`Product ${productId} not found`);

  const { connection, settings } = await getActiveTallyConnection();
  if (settings && !settings.syncProducts) {
    return { skipped: true, reason: "Product sync disabled in settings" };
  }

  const { fullXml } = mapProductToTallyStockItem(
    {
      id: product.id,
      name: product.name,
      sku: product.sku,
      code: product.code,
      hsnCode: product.hsnCode,
      description: product.description,
      purchasePrice: product.purchasePrice ? Number(product.purchasePrice) : null,
      sellingPrice: product.sellingPrice ? Number(product.sellingPrice) : null,
      gstRate: product.gstRate ? Number(product.gstRate) : 18,
      unitName: product.unit?.name || "Nos",
    },
    connection?.companyName
  );

  return enqueueSyncJob({
    entityType: "PRODUCT",
    entityId: product.id,
    entityCode: product.sku,
    entityName: product.name,
    operation: "CREATE",
    payload: product,
    xmlRequest: fullXml,
  });
}

/**
 * Enqueues a sales invoice for Tally synchronization
 */
export async function queueInvoiceSync(invoiceId: string) {
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      customer: true,
      items: {
        include: {
          variant: {
            include: {
              product: true,
            },
          },
          unit: true,
        },
      },
    },
  });

  if (!invoice) throw new Error(`Invoice ${invoiceId} not found`);

  const { connection, settings } = await getActiveTallyConnection();
  if (settings && !settings.syncSalesInvoices) {
    return { skipped: true, reason: "Sales Invoice sync disabled in settings" };
  }

  const items = (invoice.items || []).map((item: any) => ({
    productName: item.variant?.product?.name || item.variant?.name || "Item",
    unitName: item.unit?.name || "Nos",
    quantity: Number(item.quantity),
    rate: Number(item.rate),
    discount: Number(item.discount || 0),
    taxableAmt: Number(item.taxableAmt || 0),
    gstRate: Number(item.gstRate || 0),
    cgstAmt: Number(item.cgstAmt || 0),
    sgstAmt: Number(item.sgstAmt || 0),
    igstAmt: Number(item.igstAmt || 0),
    totalAmt: item.totalAmt,
  }));

  const { fullXml } = mapInvoiceToTallySalesVoucher(
    {
      id: invoice.id,
      invoiceNo: invoice.invoiceNo,
      date: invoice.date,
      dueDate: invoice.dueDate,
      customerName: invoice.customer?.name || "Cash Customer",
      customerGstin: invoice.customer?.gstin,
      billingAddress: invoice.billingAddress,
      billingState: invoice.billingState,
      totalTaxable: Number(invoice.totalTaxable || 0),
      totalTax: Number(invoice.totalTax || 0),
      totalPayable: Number(invoice.totalPayable || 0),
      roundOff: invoice.roundOff ? Number(invoice.roundOff) : 0,
      items,
      salesLedger: settings?.defaultSalesLedger,
      cgstLedger: settings?.defaultCgstLedger,
      sgstLedger: settings?.defaultSgstLedger,
      igstLedger: settings?.defaultIgstLedger,
      roundoffLedger: settings?.defaultRoundoffLedger,
    },
    connection?.companyName
  );

  return enqueueSyncJob({
    entityType: "SALES_INVOICE",
    entityId: invoice.id,
    entityCode: invoice.invoiceNo,
    entityName: `Invoice #${invoice.invoiceNo} - ${invoice.customer?.name}`,
    operation: "CREATE",
    payload: { invoiceId: invoice.id, invoiceNo: invoice.invoiceNo },
    xmlRequest: fullXml,
  });
}

/**
 * Enqueues a purchase bill for Tally synchronization
 */
export async function queuePurchaseBillSync(billId: string) {
  const bill = await db.purchaseBill.findUnique({
    where: { id: billId },
    include: {
      vendor: true,
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

  if (!bill) throw new Error(`Purchase bill ${billId} not found`);

  const { connection, settings } = await getActiveTallyConnection();
  if (settings && !settings.syncPurchaseBills) {
    return { skipped: true, reason: "Purchase Bill sync disabled in settings" };
  }

  const items = (bill.items || []).map((item: any) => ({
    productName: item.variant?.product?.name || item.variant?.name || "Item",
    unitName: "Nos",
    quantity: Number(item.quantity),
    rate: Number(item.rate),
    taxableAmt: Number(item.taxableAmt || 0),
    gstRate: Number(item.gstRate || 0),
    cgstAmt: Number(item.cgstAmt || 0),
    sgstAmt: Number(item.sgstAmt || 0),
    igstAmt: Number(item.igstAmt || 0),
  }));

  const { fullXml } = mapPurchaseBillToTallyVoucher(
    {
      id: bill.id,
      billNo: bill.billNo,
      date: bill.createdAt,
      vendorName: bill.vendor?.name || "Vendor",
      totalTaxable: Number(bill.totalTaxable || 0),
      totalTax: Number(bill.totalTax || 0),
      totalPayable: Number(bill.totalPayable || 0),
      items,
      purchaseLedger: settings?.defaultPurchaseLedger,
      inputCgstLedger: settings?.defaultCgstLedger,
      inputSgstLedger: settings?.defaultSgstLedger,
      inputIgstLedger: settings?.defaultIgstLedger,
      roundoffLedger: settings?.defaultRoundoffLedger,
    },
    connection?.companyName
  );

  return enqueueSyncJob({
    entityType: "PURCHASE_BILL",
    entityId: bill.id,
    entityCode: bill.billNo,
    entityName: `Purchase Bill #${bill.billNo} - ${bill.vendor?.name}`,
    operation: "CREATE",
    payload: { billId: bill.id, billNo: bill.billNo },
    xmlRequest: fullXml,
  });
}

/**
 * Batch queues all entities of a given type
 */
export async function queueAllEntities(entityType: string) {
  let count = 0;
  if (entityType === "CUSTOMER") {
    const customers = await db.customer.findMany({ select: { id: true } });
    for (const c of customers || []) {
      await queueCustomerSync(c.id);
      count++;
    }
  } else if (entityType === "VENDOR") {
    const vendors = await db.vendor.findMany({ select: { id: true } });
    for (const v of vendors || []) {
      await queueVendorSync(v.id);
      count++;
    }
  } else if (entityType === "PRODUCT") {
    const products = await db.product.findMany({ select: { id: true } });
    for (const p of products || []) {
      await queueProductSync(p.id);
      count++;
    }
  } else if (entityType === "SALES_INVOICE") {
    const invoices = await db.invoice.findMany({ select: { id: true } });
    for (const inv of invoices || []) {
      await queueInvoiceSync(inv.id);
      count++;
    }
  } else if (entityType === "PURCHASE_BILL") {
    const bills = await db.purchaseBill.findMany({ select: { id: true } });
    for (const b of bills || []) {
      await queuePurchaseBillSync(b.id);
      count++;
    }
  }
  return { success: true, count };
}
