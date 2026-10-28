import "dotenv/config";
import db from "@/lib/db/db";

async function checkIntegrationMode() {
  const modes = ["DIRECT", "LOCAL_BRIDGE", "BRIDGE", "CONNECTOR", "XML_OVER_HTTP", "SYNC_AGENT", "DIRECT_HTTP", "LOCAL", "TALLY_BRIDGE"];
  for (const m of modes) {
    try {
      const row = await db.tallyConnection.create({
        data: { name: `Test ${m}`, companyName: "Test Co", integrationMode: m, apiKey: `test-${m}-${Date.now()}` },
      });
      console.log(`Allowed integration_mode: '${m}' ✅`);
      await db.tallyConnection.delete({ where: { id: row.id } });
    } catch (e: any) {
      console.log(`Mode '${m}': ❌ ${e.message}`);
    }
  }
}

checkIntegrationMode()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
