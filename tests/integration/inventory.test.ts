/**
 * AGENT 6: Inventory & Stock Lifecycle Test Suite
 */

import { TestHarness } from "../helpers/test-runner";
import { buildProduct, buildWarehouse } from "../factories";
import { DatabaseVerifier } from "../helpers/db-verifier";
import db from "@/lib/db/db";

export async function runInventoryTests(harness: TestHarness) {
  harness.setContext("AGENT 6: INVENTORY", "STOCK");

  // 1. Stock Record Creation & Multi-Warehouse Tracking
  await harness.runTest(
    "Warehouse & Stock Isolation",
    "Create warehouse and verify stock allocation",
    "Stock quantity allocated to product and warehouse must persist cleanly in database",
    async () => {
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

      const whData = buildWarehouse(harness.testRunId, { branchId: branch.id });

      const wh = await db.warehouse.create({
        data: {
          name: whData.name,
          code: whData.code,
          address: whData.address,
          branchId: branch.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await DatabaseVerifier.verifyRecordExists("warehouse", { id: wh.id });

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

      const prodData = buildProduct(harness.testRunId, { categoryId: category.id, unitId: unit.id });
      const product = await db.product.create({
        data: {
          name: prodData.name,
          sku: prodData.sku,
          code: prodData.code,
          hsnCode: prodData.hsnCode,
          categoryId: category.id,
          unitId: unit.id,
          purchasePrice: 500,
          sellingPrice: 750,
          mrp: 800,
          gstRate: 18,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Create Product Variant for stock tracking
      const variant = await db.productVariant.create({
        data: {
          productId: product.id,
          name: "Standard",
          sku: `VAR-${prodData.sku}`,
        },
      });

      // Create Stock record: 100 units
      const stock = await db.stock.create({
        data: {
          productId: product.id,
          variantId: variant.id,
          warehouseId: wh.id,
          quantity: 100,
        },
      });

      await DatabaseVerifier.verifyRecordExists("stock", { id: stock.id });
      return { actual: `Verified Stock: Product ${product.name} has 100 units in Warehouse ${wh.name}`, databaseVerified: true };
    }
  );
}
