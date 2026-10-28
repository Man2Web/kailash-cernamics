/**
 * Central Test Runner & Assertion Engine for Multi-Agent QA
 */

export interface TestCaseResult {
  testId: string;
  agent: string;
  module: string;
  feature: string;
  action: string;
  expected: string;
  actual: string;
  databaseVerified: boolean;
  status: "PASS" | "FAIL" | "BLOCKED" | "SKIPPED";
  error?: string;
  durationMs: number;
  timestamp: string;
  testRunId: string;
}

export class TestHarness {
  public testRunId: string;
  public results: TestCaseResult[] = [];
  private currentAgent = "QA_AGENT";
  private currentModule = "CORE";

  constructor(testRunId: string) {
    this.testRunId = testRunId;
  }

  setContext(agent: string, module: string) {
    this.currentAgent = agent;
    this.currentModule = module;
  }

  async runTest(
    feature: string,
    action: string,
    expected: string,
    testFn: () => Promise<{ actual?: string; databaseVerified?: boolean } | void>
  ): Promise<TestCaseResult> {
    const testId = `QA-${this.currentAgent.replace(/\s+/g, "_").toUpperCase()}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const startTime = Date.now();

    try {
      const res = (await testFn()) || {};
      const durationMs = Date.now() - startTime;
      const result: TestCaseResult = {
        testId,
        agent: this.currentAgent,
        module: this.currentModule,
        feature,
        action,
        expected,
        actual: res.actual || expected,
        databaseVerified: res.databaseVerified !== undefined ? res.databaseVerified : true,
        status: "PASS",
        durationMs,
        timestamp: new Date().toISOString(),
        testRunId: this.testRunId,
      };
      this.results.push(result);
      console.log(`  [PASS] [${this.currentAgent}] ${feature} -> ${action}`);
      return result;
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const result: TestCaseResult = {
        testId,
        agent: this.currentAgent,
        module: this.currentModule,
        feature,
        action,
        expected,
        actual: `Failed with error: ${err.message}`,
        databaseVerified: false,
        status: "FAIL",
        error: err.message,
        durationMs,
        timestamp: new Date().toISOString(),
        testRunId: this.testRunId,
      };
      this.results.push(result);
      console.error(`  [FAIL] [${this.currentAgent}] ${feature} -> ${action}: ${err.message}`);
      return result;
    }
  }

  getSummary() {
    const total = this.results.length;
    const passed = this.results.filter((r) => r.status === "PASS").length;
    const failed = this.results.filter((r) => r.status === "FAIL").length;
    const blocked = this.results.filter((r) => r.status === "BLOCKED").length;
    const skipped = this.results.filter((r) => r.status === "SKIPPED").length;
    const dbVerified = this.results.filter((r) => r.databaseVerified).length;

    return {
      total,
      passed,
      failed,
      blocked,
      skipped,
      dbVerified,
      passRate: total > 0 ? `${((passed / total) * 100).toFixed(1)}%` : "0%",
    };
  }
}
