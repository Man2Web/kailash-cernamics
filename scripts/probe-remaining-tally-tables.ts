import "dotenv/config";
import db from "@/lib/db/db";

async function probeRemainingTables() {
  const tables = ["tally_sync_queue", "tally_sync_logs", "tally_entity_mappings", "tally_field_mappings"];
  for (const t of tables) {
    const cols = await db.$queryRaw`select column_name from information_schema.columns where table_schema = 'public' and table_name = ${t} order by ordinal_position`;
    console.log(`\nTable: ${t}`);
    for (const c of cols) console.log(`  + ${c.column_name}`);
  }
}

probeRemainingTables()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
