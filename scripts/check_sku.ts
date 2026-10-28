import "dotenv/config";
import db from "../src/lib/db/db";

async function main() {
  const p = await db.product.findFirst({
    where: {
      sku: "QA-SKU-RUN_013421_5CT4-017567-Z6AS",
    },
  });
  console.log("Direct findFirst by SKU:", p);

  const pInsensitive = await db.product.findFirst({
    where: {
      sku: {
        equals: "QA-SKU-RUN_013421_5CT4-017567-Z6AS",
        mode: "insensitive",
      },
    },
  });
  console.log("Insensitive findFirst by SKU:", pInsensitive);
}

main().catch(console.error);
