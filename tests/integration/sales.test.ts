/**
 * AGENT 7: Sales & Invoicing Test Suite
 */

import { TestHarness } from "../helpers/test-runner";
import { buildCustomer, buildProduct, buildSalesInvoice } from "../factories";
import { DatabaseVerifier } from "../helpers/db-verifier";
import db from "@/lib/db/db";

export async function runSalesTests(harness: TestHarness) {
  harness.setContext("AGENT 7: SALES", "INVOICING");

  // 1. Sales Invoice Creation & Mathematical Tax Validation
  await harness.runTest(
    "Sales Invoice Creation & Tax Split",
    "Create Sales Invoice with Intrastate GST (18%) and discount",
    "Invoice totalTaxableAmount, totalTaxAmount, and totalPayableAmount must calculate with mathematical accuracy",
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

      // 1. Create Test Customer & Product
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

      // 2. Build Invoice: 10 qty @ 1000 with 1000 discount
      // Taxable = 9,000. Tax (18%) = 1,620. Total Payable = 10,620.
      const invData = buildSalesInvoice(
        harness.testRunId,
        customer.id,
        [
          {
            productName: product.name,
            quantity: 10,
            rate: 1000,
            discount: 1000,
            gstRate: 18,
          },
        ],
        { branchId: branch.id, outletId: outlet.id }
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
          totalDiscountAmount: invData.totalDiscountAmount,
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

      // Verify Database records & math
      const fetchedInv = await DatabaseVerifier.verifyRecordExists("invoice", { id: invoice.id });
      if (Number(fetchedInv.totalTaxableAmount) !== 9000 || Number(fetchedInv.totalTaxAmount) !== 1620 || Number(fetchedInv.totalPayableAmount) !== 10620) {
        throw new Error(`Invoice calculation mismatch: totalTaxableAmount=${fetchedInv.totalTaxableAmount}, totalTaxAmount=${fetchedInv.totalTaxAmount}, totalPayableAmount=${fetchedInv.totalPayableAmount}`);
      }

      return { actual: `Verified Invoice ${invoice.invoiceNo}: Taxable=9000, Tax=1620, Payable=10620`, databaseVerified: true };
    }
  );
}
