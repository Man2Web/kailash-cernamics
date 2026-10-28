import "dotenv/config";
import { getActiveTallyConnection } from "./src/lib/tally/sync-service.ts";
import { getTallySyncStats } from "./src/lib/tally/sync-status.ts";

async function test() {
  console.log("Testing getActiveTallyConnection()...");
  const connData = await getActiveTallyConnection();
  console.log("getActiveTallyConnection Result:", connData.connection?.name, connData.settings?.defaultDebtorGroup);

  console.log("\nTesting getTallySyncStats()...");
  const stats = await getTallySyncStats();
  console.log("getTallySyncStats Result -> success:", stats.success, "counts:", stats.counts);
}

test();
