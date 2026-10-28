import "dotenv/config";
import db from "@/lib/db/db";

async function checkColumns() {
  const tables = ["invoices", "sales_orders", "quotations"];
  for (const t of tables) {
    const cols = await db.$queryRaw`select column_name from information_schema.columns where table_schema = 'public' and table_name = ${t} order by ordinal_position`;
    console.log(`Table ${t} columns:`, cols.map((c: any) => c.column_name));
  }
}

checkColumns()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
