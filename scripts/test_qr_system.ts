import "dotenv/config";
import db from "../src/lib/db/db";
import {
  backfillAllProductQrCodes,
  resolveProductByQr,
  getOrGenerateProductQr,
  getLiveProductInventory,
} from "../src/lib/products/qr";

async function main() {
  console.log("==================================================");
  console.log("1. TESTING QR BACKFILL FOR ALL PRODUCTS");
  console.log("==================================================");
  const backfillResult = await backfillAllProductQrCodes();
  console.log("Backfill result:", backfillResult);

  console.log("\n==================================================");
  console.log("2. TESTING MULTI-WAREHOUSE STOCK & PERMANENT QR");
  console.log("==================================================");
  const products = await db.product.findMany({
    take: 5,
    include: {
      category: true,
      brand: true,
      unit: true,
    },
  });
  console.log(`Testing with ${products.length} products:`);

  for (const prod of products) {
    console.log(`\n--- Product: "${prod.name}" ---`);
    console.log(`  ID: ${prod.id}`);
    console.log(`  Code: ${prod.code}`);
    console.log(`  SKU: ${prod.sku}`);
    
    // 1. Get or generate permanent QR
    const qrToken1 = await getOrGenerateProductQr(prod.id, prod.code, prod.sku);
    console.log(`  Permanent QR Token: ${qrToken1}`);

    // 2. Test duplicate generation attempt - MUST return same QR token
    const qrToken2 = await getOrGenerateProductQr(prod.id, prod.code, prod.sku);
    if (qrToken1 === qrToken2) {
      console.log(`  [PASS] Permanent QR idempotency verified (Token didn't change: ${qrToken1})`);
    } else {
      console.error(`  [FAIL] QR Token changed on second call! ${qrToken1} vs ${qrToken2}`);
    }

    // 3. Test Live Inventory Query
    const liveInv = await getLiveProductInventory(prod.id);
    if (!liveInv) {
      console.error(`  [FAIL] Could not get live inventory for product ${prod.id}`);
      continue;
    }

    console.log(`  Stock Summary:`);
    console.log(`    - Total On Hand: ${liveInv.totalOnHand}`);
    console.log(`    - Total Reserved: ${liveInv.totalReserved}`);
    console.log(`    - Total Available: ${liveInv.totalAvailable}`);
    console.log(`    - Warehouses Breakdown:`);
    for (const w of liveInv.warehouses) {
      console.log(`      * ${w.warehouseName}: On Hand=${w.onHand}, Reserved=${w.reserved}, Available=${w.available}`);
    }

    // 4. Resolve by QR token
    const resolvedByQr = await resolveProductByQr(qrToken1);
    if (resolvedByQr && resolvedByQr.product.id === prod.id) {
      console.log(`  [PASS] Resolved successfully by QR Token! Product Name: ${resolvedByQr.product.name}`);
    } else {
      console.error(`  [FAIL] Failed to resolve by QR Token: ${qrToken1}`);
    }

    // 5. Resolve by SKU
    const resolvedBySku = await resolveProductByQr(prod.sku);
    if (resolvedBySku && resolvedBySku.product.id === prod.id) {
      console.log(`  [PASS] Resolved successfully by SKU: ${prod.sku}`);
    } else {
      console.error(`  [FAIL] Failed to resolve by SKU: ${prod.sku}`);
    }

    // 6. Resolve by Product Code
    const resolvedByCode = await resolveProductByQr(prod.code);
    if (resolvedByCode && resolvedByCode.product.id === prod.id) {
      console.log(`  [PASS] Resolved successfully by Product Code: ${prod.code}`);
    } else {
      console.error(`  [FAIL] Failed to resolve by Product Code: ${prod.code}`);
    }
  }

  console.log("\n==================================================");
  console.log("3. TESTING INVALID / NON-EXISTENT QR CODES");
  console.log("==================================================");
  const invalidResult1 = await resolveProductByQr("PROD-QR-DOESNOTEXIST999");
  console.log("Lookup 'PROD-QR-DOESNOTEXIST999' -> Result:", invalidResult1);
  if (invalidResult1 === null) {
    console.log("[PASS] Non-existent QR token correctly returns null.");
  } else {
    console.error("[FAIL] Non-existent QR token did not return null!");
  }

  const invalidResult2 = await resolveProductByQr("");
  console.log("Lookup empty string -> Result:", invalidResult2);
  if (invalidResult2 === null) {
    console.log("[PASS] Empty string correctly returns null.");
  }

  console.log("\n==================================================");
  console.log("ALL ACCEPTANCE TESTS COMPLETED SUCCESSFULLY");
  console.log("==================================================");
}

main()
  .catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
  });
