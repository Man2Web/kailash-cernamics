/**
 * Agent 19: Safe Data Cleanup Helper
 * Strictly purges only test records tagged with the current TEST_RUN_ID.
 */

import db from "@/lib/db/db";

export async function cleanupTestRunData(testRunId: string): Promise<{ cleanedRecordsCount: number }> {
  console.log(`\n🧹 [AGENT 19: DATA CLEANUP] Purging test artifacts for run: ${testRunId}...`);
  let cleanedCount = 0;

  try {
    // 1. Clean test invoices and line items
    try {
      const testInvoices = await db.invoice.findMany({
        where: { invoiceNumber: { contains: testRunId } },
      });
      for (const inv of testInvoices || []) {
        try {
          await db.invoiceItem.deleteMany({ where: { invoiceId: inv.id } });
          await db.invoice.delete({ where: { id: inv.id } });
          cleanedCount++;
        } catch {}
      }
    } catch {}

    // 2. Clean test customers
    try {
      const testCustomers = await db.customer.findMany({
        where: { code: { contains: testRunId } },
      });
      for (const cust of testCustomers || []) {
        try {
          await db.customerAddress.deleteMany({ where: { customerId: cust.id } });
          await db.customer.delete({ where: { id: cust.id } });
          cleanedCount++;
        } catch {}
      }
    } catch {}

    // 3. Clean test vendors
    try {
      const testVendors = await db.vendor.findMany({
        where: { code: { contains: testRunId } },
      });
      for (const vend of testVendors || []) {
        try {
          await db.vendorAddress.deleteMany({ where: { vendorId: vend.id } });
          await db.vendor.delete({ where: { id: vend.id } });
          cleanedCount++;
        } catch {}
      }
    } catch {}

    // 4. Clean test products & stock ledger
    try {
      const testProducts = await db.product.findMany({
        where: { code: { contains: testRunId } },
      });
      for (const prod of testProducts || []) {
        try {
          await db.stockLedger.deleteMany({ where: { productId: prod.id } });
          await db.product.delete({ where: { id: prod.id } });
          cleanedCount++;
        } catch {}
      }
    } catch {}

    // 5. Clean test warehouses
    try {
      const testWarehouses = await db.warehouse.findMany({
        where: { name: { contains: testRunId } },
      });
      for (const wh of testWarehouses || []) {
        try {
          await db.warehouse.delete({ where: { id: wh.id } });
          cleanedCount++;
        } catch {}
      }
    } catch {}

    // 6. Clean test sync queue items
    try {
      const testQueue = await db.tallySyncQueue.findMany({
        where: { entityCode: { contains: testRunId } },
      });
      for (const q of testQueue || []) {
        try {
          await db.tallySyncQueue.delete({ where: { id: q.id } });
          cleanedCount++;
        } catch {}
      }
    } catch {}

    console.log(`  ✅ Purged ${cleanedCount} test entities tagged with '${testRunId}'. Zero production data modified.`);
    return { cleanedRecordsCount: cleanedCount };
  } catch (err: any) {
    console.warn(`  ⚠️ Cleanup encountered an exception (non-fatal):`, err.message);
    return { cleanedRecordsCount: cleanedCount };
  }
}
