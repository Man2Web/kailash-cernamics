import "dotenv/config";
import db from "@/lib/db/db";

async function checkSalesSchema() {
  console.log("Checking Invoices...");
  const invoices = await db.invoice.findMany({ take: 1 });
  console.log("Sample Invoice:", invoices[0]);

  console.log("Checking Sales Orders...");
  const orders = await db.salesOrder.findMany({ take: 1 });
  console.log("Sample Sales Order:", orders[0]);

  console.log("Checking Quotations...");
  const quotations = await db.quotation.findMany({ take: 1 });
  console.log("Sample Quotation:", quotations[0]);
}

checkSalesSchema()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
