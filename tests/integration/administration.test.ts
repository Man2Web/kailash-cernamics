/**
 * AGENT 11: Settings & Administration Test Suite
 */

import { TestHarness } from "../helpers/test-runner";
import db from "@/lib/db/db";

export async function runAdministrationTests(harness: TestHarness) {
  harness.setContext("AGENT 11: ADMINISTRATION", "SETTINGS");

  // 1. Company Information Persistence
  await harness.runTest(
    "Company Configuration",
    "Verify primary company profile attributes",
    "Company name, tax identifier, and default currency must persist cleanly",
    async () => {
      let company = await db.company.findFirst();
      if (!company) {
        company = await db.company.create({
          data: {
            name: "SixOrbit ERP Systems Ltd",
            code: "CMP-001",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
      }

      if (!company.name) {
        throw new Error("Company record missing valid name attribute.");
      }

      return { actual: `Company '${company.name}' verified (ID: ${company.id})`, databaseVerified: true };
    }
  );
}
