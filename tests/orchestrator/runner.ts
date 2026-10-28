/**
 * AGENT 1: QA Orchestrator & Master Test Runner
 * Executes the entire Multi-Agent QA System in a disciplined, controlled sequence.
 */

import "dotenv/config";
import { TestHarness } from "../helpers/test-runner";
import { cleanupTestRunData } from "../helpers/cleanup";
import { runAuthRBACTests } from "../e2e/auth-rbac.test";
import { runDashboardTests } from "../e2e/dashboard.test";
import { runMastersTests } from "../integration/masters.test";
import { runInventoryTests } from "../integration/inventory.test";
import { runSalesTests } from "../integration/sales.test";
import { runPurchaseTests } from "../integration/purchase.test";
import { runFinanceTests } from "../integration/finance.test";
import { runReportsTests } from "../integration/reports.test";
import { runAdministrationTests } from "../integration/administration.test";
import { runTallyIntegrationTests } from "../tally/tally-integration.test";
import { runDatabaseIntegrityTests } from "../database/integrity.test";
import { runApiTests } from "../api/api-suite.test";
import { runSecurityTests } from "../security/security.test";
import { runPerformanceTests } from "../performance/performance.test";
import { runRegressionTests } from "../regression/regression-suite.test";
import { runFinalQATests } from "../release/final-qa.test";

async function main() {
  const runId = `RUN_${Date.now().toString().slice(-6)}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  console.log("============================================================");
  console.log(`🚀 SIXORBIT ERP: MULTI-AGENT QA & TEST AUTOMATION SYSTEM`);
  console.log(`   TEST RUN ID: ${runId}`);
  console.log(`   TIMESTAMP:   ${new Date().toISOString()}`);
  console.log("============================================================\n");

  const harness = new TestHarness(runId);

  try {
    // 1. Auth & RBAC
    console.log("▶ Executing Agent 3: Authentication & RBAC Suite...");
    await runAuthRBACTests(harness);

    // 2. Dashboard Analytics
    console.log("\n▶ Executing Agent 4: Dashboard Analytics Suite...");
    await runDashboardTests(harness);

    // 3. Master Data
    console.log("\n▶ Executing Agent 5: Master Data Suite...");
    await runMastersTests(harness);

    // 4. Inventory Lifecycle
    console.log("\n▶ Executing Agent 6: Inventory & Stock Ledger Suite...");
    await runInventoryTests(harness);

    // 5. Sales & Invoicing
    console.log("\n▶ Executing Agent 7: Sales & Invoicing Suite...");
    await runSalesTests(harness);

    // 6. Purchase & Procurement
    console.log("\n▶ Executing Agent 8: Purchase & Procurement Suite...");
    await runPurchaseTests(harness);

    // 7. Finance & Payments
    console.log("\n▶ Executing Agent 9: Finance & Payments Suite...");
    await runFinanceTests(harness);

    // 8. Reports Reconciliation
    console.log("\n▶ Executing Agent 10: Reports Accuracy Suite...");
    await runReportsTests(harness);

    // 9. Administration & Settings
    console.log("\n▶ Executing Agent 11: Settings & Administration Suite...");
    await runAdministrationTests(harness);

    // 10. TallyPrime Integration
    console.log("\n▶ Executing Agent 12: TallyPrime Integration Suite...");
    await runTallyIntegrationTests(harness);

    // 11. Database Integrity
    console.log("\n▶ Executing Agent 13: Database Integrity Suite...");
    await runDatabaseIntegrityTests(harness);

    // 12. API Routes
    console.log("\n▶ Executing Agent 14: API Route Suite...");
    await runApiTests(harness);

    // 13. Security & Secrets Exposure
    console.log("\n▶ Executing Agent 16: Security Audit Suite...");
    await runSecurityTests(harness);

    // 14. Performance & Latency
    console.log("\n▶ Executing Agent 17: Performance & Latency Suite...");
    await runPerformanceTests(harness);

    // 15. Cross-Module Regression Chain
    console.log("\n▶ Executing Agent 18: Cross-Module Regression Suite...");
    await runRegressionTests(harness);

    // 16. Data Cleanup
    console.log("\n▶ Executing Agent 19: Scoped Test Data Cleanup...");
    await cleanupTestRunData(runId);

    // 17. Final Release Gate
    console.log("\n▶ Executing Agent 20: Final Release QA Audit...");
    await runFinalQATests(harness);

  } catch (err: any) {
    console.error(`\n❌ Fatal error during test execution:`, err.message);
  }

  // Print Summary
  const summary = harness.getSummary();
  console.log("\n============================================================");
  console.log(`📊 FINAL QA AUTOMATION SUMMARY [${runId}]`);
  console.log("============================================================");
  console.log(`  Total Test Cases:    ${summary.total}`);
  console.log(`  Passed:              ${summary.passed} ✅`);
  console.log(`  Failed:              ${summary.failed} ❌`);
  console.log(`  Database Verified:   ${summary.dbVerified} / ${summary.total}`);
  console.log(`  Success Rate:        ${summary.passRate}`);
  console.log("============================================================\n");

  if (summary.failed > 0) {
    process.exit(1);
  }
}

main();
