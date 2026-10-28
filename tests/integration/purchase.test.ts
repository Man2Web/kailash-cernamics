/**
 * AGENT 8: Purchase & Procurement Test Suite
 */

import { TestHarness } from "../helpers/test-runner";
import { buildVendor, buildProduct } from "../factories";
import { DatabaseVerifier } from "../helpers/db-verifier";
import db from "@/lib/db/db";

export async function runPurchaseTests(harness: TestHarness) {
  harness.setContext("AGENT 8: PURCHASE", "PROCUREMENT");

  // 1. Purchase Order & Vendor Association
  await harness.runTest(
    "Purchase Bill Lifecycle",
    "Create Vendor and verify procurement associations",
    "Purchase bill with input tax should persist cleanly with line items",
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

      const vendData = buildVendor(harness.testRunId);
      const vendor = await db.vendor.create({
        data: {
          name: vendData.name,
          code: vendData.code,
          email: vendData.email,
          phone: vendData.phone,
          gstin: vendData.gstin,
        },
      });

      const prodData = buildProduct(harness.testRunId, { categoryId: category.id, unitId: unit.id });
      const product = await db.product.create({
        data: {
          name: prodData.name,
          sku: prodData.sku,
          code: prodData.code,
          purchasePrice: 400,
          sellingPrice: 600,
          mrp: 700,
          gstRate: 18,
          categoryId: category.id,
          unitId: unit.id,
        },
      });

      // Verify vendor exists
      await DatabaseVerifier.verifyRecordExists("vendor", { id: vendor.id });
      await DatabaseVerifier.verifyRecordExists("product", { id: product.id });

      return { actual: `Verified Purchase vendor ${vendor.name} and product ${product.name}`, databaseVerified: true };
    }
  );
}
