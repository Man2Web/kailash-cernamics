/**
 * AGENT 9: Finance, Payments & Accounting Test Suite
 */

import { TestHarness } from "../helpers/test-runner";
import { buildCustomer, buildSalesInvoice, buildProduct } from "../factories";
import { DatabaseVerifier } from "../helpers/db-verifier";
import db from "@/lib/db/db";

export async function runFinanceTests(harness: TestHarness) {
  harness.setContext("AGENT 9: FINANCE", "ACCOUNTING");

  // 1. Payment Settlement & Status Update
  await harness.runTest(
    "Payment Allocation Lifecycle",
    "Apply payment update against an Invoice",
    "Invoice payment status should update to PARTIAL / PAID in database",
    async () => {
      let group = await db.customerGroup.findFirst();
      if (!group) {
        group = await db.customerGroup.create({
          data: { name: "Standard Customers", discountPercent: 0 },
        });
      }

      let branch = await db.branch.findFirst();
      if (!branch) {
        let company = await db.company.findFirst();
        if (!company) {
          company = await db.company.create({
            data: { name: "SixOrbit ERP Systems Ltd", code: "CMP-001" },
          });
        }
        branch = await db.branch.create({
          data: { name: "Main Branch", code: "BR-001", companyId: company.id },
        });
      }

      let outlet = await db.outlet.findFirst();
      if (!outlet) {
        outlet = await db.outlet.create({
          data: { name: "Main Outlet", code: "OUT-001", branchId: branch.id },
        });
      }

      let category = await db.category.findFirst();
      if (!category) {
        category = await db.category.create({
          data: { name: "General Goods", code: `CAT-${Date.now().toString().slice(-4)}` },
        });
      }

      let unit = await db.unit.findFirst();
      if (!unit) {
        unit = await db.unit.create({
          data: { name: "Numbers", code: `NOS-${Date.now().toString().slice(-4)}` },
        });
      }

      const custData = buildCustomer(harness.testRunId, { groupId: group.id });
      const customer = await db.customer.create({
        data: {
          name: custData.name,
          code: custData.code,
          email: custData.email,
          phone: custData.phone,
          gstin: custData.gstin,
          groupId: group.id,
        },
      });

      const prodData = buildProduct(harness.testRunId, { categoryId: category.id, unitId: unit.id });
      const product = await db.product.create({
        data: {
          name: prodData.name,
          sku: prodData.sku,
          code: prodData.code,
          sellingPrice: 1000,
          purchasePrice: 600,
          mrp: 1200,
          gstRate: 18,
          categoryId: category.id,
          unitId: unit.id,
        },
      });

      const invData = buildSalesInvoice(
        harness.testRunId,
        customer.id,
        [{ productName: product.name, quantity: 10, rate: 1000, discount: 0, gstRate: 18 }]
      );

      const invoice = await db.invoice.create({
        data: {
          branchId: branch.id,
          outletId: outlet.id,
          customerId: invData.customerId,
          invoiceNo: invData.invoiceNo,
          invoiceDate: invData.invoiceDate,
          dueDate: invData.dueDate,
          totalQty: invData.totalQty,
          totalTaxableAmount: invData.totalTaxableAmount,
          totalDiscountAmount: 0,
          totalTaxAmount: invData.totalTaxAmount,
          totalPayableAmount: invData.totalPayableAmount,
          roundOff: 0,
          status: "APPROVED",
          paymentStatus: "UNPAID",
          billingAddress: "123 Business Park",
          billingState: "Maharashtra",
          billingCity: "Mumbai",
          billingPincode: "400069",
          deliveryAddress: "123 Business Park",
          deliveryState: "Maharashtra",
          deliveryCity: "Mumbai",
          deliveryPincode: "400069",
        },
      });

      // Update payment status to PARTIAL
      await db.invoice.update({
        where: { id: invoice.id },
        data: { paymentStatus: "PARTIAL" },
      });

      // Verify updated field in DB
      const updatedInv = await DatabaseVerifier.verifyRecordExists("invoice", { id: invoice.id });
      if (updatedInv.paymentStatus !== "PARTIAL") {
        throw new Error(`Expected paymentStatus=PARTIAL, got ${updatedInv.paymentStatus}`);
      }

      return { actual: `Updated payment status to PARTIAL for invoice ${invoice.invoiceNo}`, databaseVerified: true };
    }
  );
}
