import "dotenv/config";
import db from "@/lib/db/db";

async function testFinance() {
  console.log("Fetching Chart of Accounts...");
  const accounts = (await db.chartOfAccount.findMany({ orderBy: { code: "asc" } })) || [];
  console.log(`Found ${accounts.length} Chart of Accounts in DB`);

  console.log("Fetching Journal Entries...");
  const journalEntries = (await db.journalEntry.findMany({ orderBy: { date: "desc" } })) || [];
  console.log(`Found ${journalEntries.length} Journal Entries in DB`);

  console.log("Fetching Journal Entry Items...");
  const journalItems = (await db.journalEntryItem.findMany()) || [];
  console.log(`Found ${journalItems.length} Journal Entry Items in DB`);
}

testFinance()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Finance DB Error:", err);
    process.exit(1);
  });
