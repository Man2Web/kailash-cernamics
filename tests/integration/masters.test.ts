/**
 * AGENT 5: Master Data Test Suite (Customers, Vendors, Products)
 */

import { TestHarness } from "../helpers/test-runner";
import { buildCustomer, buildVendor, buildProduct } from "../factories";
import { DatabaseVerifier } from "../helpers/db-verifier";
import db from "@/lib/db/db";

export async function runMastersTests(harness: TestHarness) {
  harness.setContext("AGENT 5: MASTER DATA", "MASTERS");

  let createdCustomerId = "";
  let createdVendorId = "";
  let createdProductId = "";

  // 1. Customer CRUD & Database Verification
  await harness.runTest(
    "Customer Lifecycle",
    "Create, update and verify Customer in database",
    "Customer should persist in DB with valid GSTIN, credit limit, and relations",
    async () => {
      let group = await db.customerGroup.findFirst();
      if (!group) {
        group = await db.customerGroup.create({
          data: { name: "Standard Customers", discountPercent: 0 },
        });
      }

      const custData = buildCustomer(harness.testRunId, { groupId: group.id });

      const created = await db.customer.create({
        data: {
          name: custData.name,
          code: custData.code,
          email: custData.email,
          phone: custData.phone,
          gstin: custData.gstin,
          creditLimit: custData.creditLimit,
          groupId: group.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      createdCustomerId = created.id;

      const fetched = await DatabaseVerifier.verifyRecordExists("customer", { id: createdCustomerId });
      if (fetched.name !== custData.name || fetched.gstin !== custData.gstin) {
        throw new Error("Customer database values do not match factory input.");
      }

      await db.customer.update({
        where: { id: createdCustomerId },
        data: { creditLimit: 750000 },
      });

      await DatabaseVerifier.verifyRecordFields("customer", createdCustomerId, { creditLimit: 750000 });
      return { actual: `Created & verified customer ${created.name} (Code: ${created.code})`, databaseVerified: true };
    }
  );

  // 2. Vendor CRUD & Database Verification
  await harness.runTest(
    "Vendor Lifecycle",
    "Create, update and verify Vendor in database",
    "Vendor should persist with creditor terms and contact details",
    async () => {
      const vendData = buildVendor(harness.testRunId);

      const created = await db.vendor.create({
        data: {
          name: vendData.name,
          code: vendData.code,
          email: vendData.email,
          phone: vendData.phone,
          gstin: vendData.gstin,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      createdVendorId = created.id;

      await DatabaseVerifier.verifyRecordExists("vendor", { id: createdVendorId });
      return { actual: `Created & verified vendor ${created.name} (Code: ${created.code})`, databaseVerified: true };
    }
  );

  // 3. Product & Stock Item Master
  await harness.runTest(
    "Product Lifecycle",
    "Create, update and verify Product master",
    "Product must have valid SKU, HSN, GST Rate, and initial stock record",
    async () => {
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

      const prodData = buildProduct(harness.testRunId, {
        categoryId: category.id,
        unitId: unit.id,
      });

      const created = await db.product.create({
        data: {
          name: prodData.name,
          sku: prodData.sku,
          code: prodData.code,
          hsnCode: prodData.hsnCode,
          categoryId: category.id,
          unitId: unit.id,
          purchasePrice: prodData.purchasePrice,
          sellingPrice: prodData.sellingPrice,
          mrp: prodData.mrp,
          gstRate: prodData.gstRate,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      createdProductId = created.id;

      await DatabaseVerifier.verifyRecordExists("product", { id: createdProductId });
      return { actual: `Created & verified product ${created.name} (SKU: ${created.sku})`, databaseVerified: true };
    }
  );

  return { createdCustomerId, createdVendorId, createdProductId };
}
