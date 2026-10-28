import "dotenv/config";
import db from "@/lib/db/db";

async function inspectTallyCols() {
  const cols = await db.$queryRaw`select column_name, data_type, is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'tally_connections' order by ordinal_position`;
  console.log("tally_connections columns:", cols);
}

inspectTallyCols()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
