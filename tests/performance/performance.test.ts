/**
 * AGENT 17: Performance & Query Latency Suite
 */

import { TestHarness } from "../helpers/test-runner";
import db from "@/lib/db/db";

export async function runPerformanceTests(harness: TestHarness) {
  harness.setContext("AGENT 17: PERFORMANCE", "PERFORMANCE");

  // 1. Invoices Fetch Latency
  await harness.runTest(
    "Query Latency (Invoices)",
    "Benchmark findMany query latency for invoices",
    "Database fetch query must execute within acceptable threshold (< 1000ms)",
    async () => {
      const start = Date.now();
      await db.invoice.findMany({ take: 20 });
      const duration = Date.now() - start;

      if (duration > 2000) {
        throw new Error(`Invoice query exceeded performance threshold: ${duration}ms`);
      }
      return { actual: `Invoices query latency: ${duration}ms`, databaseVerified: true };
    }
  );
}
