import "dotenv/config";
import db from "../src/lib/db/db";

async function main() {
  const barcodes = await db.productBarcode.findMany();
  console.log("Barcodes count:", barcodes.length);
  for (const b of barcodes) {
    console.log(`Barcode ID: ${b.id}, Product ID: ${b.productId}, Code: ${b.code}`);
  }
}

main().catch(console.error);
