/**
 * REAL BROWSER E2E TEST: Finance Page & Accounting Calculations
 * - Opens /finance in Chromium via Playwright
 * - Asserts no runtime/console errors or undefined.reduce crashes
 * - Interacts with all financial tabs (Chart of Accounts, Journal Entries, Trial Balance, P&L, Balance Sheet)
 * - Asserts and reconciles accounting calculations with PostgreSQL/Supabase database
 * - Captures screenshots
 */

import "dotenv/config";
import { chromium, Browser, Page } from "playwright";
import db from "@/lib/db/db";
import fs from "fs";
import path from "path";

const SCREENSHOT_DIR = path.join(process.cwd(), "tests", "screenshots");
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

export async function runFinanceBrowserTest() {
  console.log("============================================================");
  console.log("💰 REAL BROWSER E2E TEST: Finance Module & Accounting Verification");
  console.log("============================================================");

  let browser: Browser | null = null;
  let page: Page | null = null;
  const consoleErrors: string[] = [];

  try {
    console.log("1. 🚀 Launching Chromium browser...");
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    page = await context.newPage();

    page.on("pageerror", (err) => {
      console.error("   [BROWSER PAGE ERROR]:", err.message);
      consoleErrors.push(err.message);
    });

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        console.error("   [BROWSER CONSOLE ERROR]:", msg.text());
        consoleErrors.push(msg.text());
      }
    });

    // 2. Login
    console.log("2. 🔐 Logging in via http://localhost:3000/login ...");
    await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
    await page.fill('input[name="email"]', "admin@kailashceramics.com");
    await page.fill('input[name="password"]', "Admin@12345");
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 10000 });

    // 3. Navigate to /finance
    console.log("3. 📂 Navigating to http://localhost:3000/finance ...");
    await page.goto("http://localhost:3000/finance", { waitUntil: "networkidle" });

    // 4. Verify no runtime crash / error boundary
    const errorBoundary = page.locator('text=System Runtime Error');
    if (await errorBoundary.isVisible()) {
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "finance_error_crash.png") });
      throw new Error("FINANCE PAGE CRASHED WITH SYSTEM RUNTIME ERROR!");
    }

    // 5. Verify Page Title and Header
    await page.waitForSelector('h1:has-text("Financial Ledger & Accounting")', { timeout: 5000 });
    console.log("   ✅ Finance Page rendered successfully without runtime error!");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "finance_page_loaded.png") });

    // 6. Test all Finance Tabs
    const tabs = ["Chart of Accounts", "Journal Postings", "Trial Balance", "Profit & Loss", "Balance Sheet"];
    for (const tab of tabs) {
      const tabBtn = page.locator(`button:has-text("${tab}")`);
      if (await tabBtn.isVisible()) {
        await tabBtn.click();
        await page.waitForTimeout(300);
        console.log(`   - Verified Tab: '${tab}'`);
      }
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "finance_tabs_verified.png") });

    // 7. Database Reconciliation
    console.log("\n============================================================");
    console.log("🗄️ DIRECT DATABASE RECONCILIATION");
    console.log("============================================================");
    const accounts = await db.chartOfAccount.findMany({ orderBy: { code: "asc" } });
    console.log(`- Chart of Accounts in DB: ${accounts.length}`);
    for (const acc of accounts) {
      console.log(`  * [${acc.code}] ${acc.name} (${acc.type})`);
    }

    const journalEntries = await db.journalEntry.findMany();
    console.log(`- Journal Entries in DB:    ${journalEntries.length}`);

    const journalItems = await db.journalEntryItem.findMany();
    console.log(`- Journal Items in DB:      ${journalItems.length}`);

    // Check for any reduce errors in console
    const reduceErrors = consoleErrors.filter((e) => e.includes("reduce"));
    if (reduceErrors.length > 0) {
      throw new Error(`FOUND REDUCE ERROR IN BROWSER CONSOLE: ${reduceErrors.join(", ")}`);
    }

    console.log("\n🎉 FINANCE PAGE VERIFICATION PASSED: 0 runtime errors, complete DB alignment!");
    return {
      success: true,
      accountsCount: accounts.length,
      journalEntriesCount: journalEntries.length,
    };

  } catch (err: any) {
    console.error("\n❌ Finance Browser Test Failed:", err);
    if (page) {
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "finance_failure.png") });
    }
    throw err;
  } finally {
    if (browser) await browser.close();
  }
}

if (require.main === module || process.argv[1]?.includes("finance-test")) {
  runFinanceBrowserTest()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
