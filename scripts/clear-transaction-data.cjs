// Clears stock, sales, purchase and delivery data while KEEPING: users/roles/sessions, products (+variants, QR codes, categories,
// brands, units), customers, vendors, branches, outlets, warehouses (+locations/racks/bins), employees, attendance, company settings,
// chart of accounts, tax rates and Tally settings.
//
// Deleted: stock + inventory ledger/transactions (this includes stock reservations and delivery/status history), sales orders,
// quotations, invoices, payments, deliveries, purchase orders, goods receipts, purchase bills, stock transfers, and the journal
// entries those documents created. Customer / vendor outstanding balances and ledger balances are reset to 0.
//
// Runs in ONE transaction. Default is a DRY RUN: prints before/after counts and rolls back.
//   node scripts/clear-transaction-data.cjs                                   (dry run)
//   DRY=0 CONFIRM=WIPE_TRANSACTIONS node scripts/clear-transaction-data.cjs   (delete for real)
const { Client } = require("pg");

const DRY = process.env.DRY !== "0";
if (!DRY && process.env.CONFIRM !== "WIPE_TRANSACTIONS") {
  console.error("Refusing to delete: also set CONFIRM=WIPE_TRANSACTIONS.");
  process.exit(1);
}

// Children before parents.
const WIPE = [
  "stock_serial_numbers",
  "stock_batches",
  "stock_transfer_items",
  "stock_transfers",
  "inventory_ledger",
  "inventory_transactions",
  "stock",
  "tax_transactions",
  "payment_allocations",
  "payments",
  "invoice_items",
  "invoices",
  "sales_order_items",
  "sales_orders",
  "quotation_items",
  "quotations",
  "vehicle_movements",
  "goods_receipt_items",
  "goods_receipts",
  "purchase_bill_items",
  "purchase_bills",
  "purchase_order_items",
  "purchase_orders",
  "journal_entry_items",
  "journal_entries",
];

const KEEP = [
  "users", "roles", "user_roles", "sessions", "products", "product_variants", "product_barcodes", "categories", "brands", "units",
  "customers", "vendors", "branches", "outlets", "warehouses", "warehouse_locations", "racks", "bins", "employees", "activity_logs",
  "chart_of_accounts", "ledgers", "tax_rates",
];

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const count = async (t) => Number((await c.query(`select count(*) n from "${t}"`)).rows[0].n);
  const snap = async (tables) => {
    const out = {};
    for (const t of tables) out[t] = await count(t);
    return out;
  };

  await c.query("begin");
  try {
    const keepBefore = await snap(KEEP);
    const wipeBefore = await snap(WIPE);
    for (const t of WIPE) await c.query(`delete from "${t}"`);
    const resets = [];
    resets.push("customers.outstanding_amt=" + (await c.query("update customers set outstanding_amt = 0 where outstanding_amt <> 0")).rowCount);
    resets.push("vendors.outstanding_amt=" + (await c.query("update vendors set outstanding_amt = 0 where outstanding_amt <> 0")).rowCount);
    resets.push("ledgers.balance=" + (await c.query("update ledgers set balance = 0 where balance <> 0")).rowCount);

    const wipeAfter = await snap(WIPE);
    const keepAfter = await snap(KEEP);
    const changedKeep = KEEP.filter((t) => keepBefore[t] !== keepAfter[t]);

    console.log("TABLE".padEnd(26), "BEFORE".padStart(7), "AFTER".padStart(7));
    for (const t of WIPE) console.log(t.padEnd(26), String(wipeBefore[t]).padStart(7), String(wipeAfter[t]).padStart(7));
    console.log("\nKept tables (row counts unchanged):");
    console.log(KEEP.map((t) => `${t}=${keepAfter[t]}`).join("  "));
    console.log("Balance resets:", resets.join("  "));
    if (changedKeep.length) throw new Error("A kept table changed, aborting: " + changedKeep.join(", "));
    if (WIPE.some((t) => wipeAfter[t] !== 0)) throw new Error("Some tables were not emptied, aborting.");

    if (DRY) {
      await c.query("rollback");
      console.log("\nDRY RUN: nothing was deleted. Re-run with DRY=0 CONFIRM=WIPE_TRANSACTIONS to apply.");
    } else {
      await c.query("commit");
      console.log("\nCOMMITTED: transaction data cleared.");
    }
  } catch (e) {
    await c.query("rollback");
    console.error("ROLLED BACK:", e.message);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
})();
