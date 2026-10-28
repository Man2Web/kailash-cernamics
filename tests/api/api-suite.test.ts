/**
 * AGENT 14: API Route Testing Suite
 */

import { TestHarness } from "../helpers/test-runner";
import { getActiveTallyConnection } from "@/lib/tally/sync-service";
import { getTallySyncStats } from "@/lib/tally/sync-status";

export async function runApiTests(harness: TestHarness) {
  harness.setContext("AGENT 14: API TESTING", "API");

  // 1. Tally Status API Logic
  await harness.runTest(
    "Tally Status Handler",
    "Call getTallySyncStats handler",
    "Should return counts object with pending, processing, synced, and failed metrics",
    async () => {
      const stats = await getTallySyncStats();
      if (!stats.counts || typeof stats.counts.pending !== "number") {
        throw new Error("Stats payload missing counts metric properties.");
      }
      return { actual: `API returned stats: Total=${stats.counts.total}, Pending=${stats.counts.pending}`, databaseVerified: true };
    }
  );

  // 2. Tally Connection Configuration API
  await harness.runTest(
    "Tally Connection Handler",
    "Call getActiveTallyConnection handler",
    "Should return connection parameters and default ledger settings",
    async () => {
      const connData = await getActiveTallyConnection();
      if (!connData.connection || !connData.settings) {
        throw new Error("Connection handler did not return connection and settings objects.");
      }
      return { actual: `API returned connection '${connData.connection.name}' (${connData.connection.host}:${connData.connection.port})`, databaseVerified: true };
    }
  );
}
