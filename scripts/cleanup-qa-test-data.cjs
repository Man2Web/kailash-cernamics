// One-off cleanup: removes the "QA-TEST ..." records created during the production flow test (and the attendance entries made that day).
// Runs in ONE transaction. Default is a DRY RUN that prints what it would delete and rolls back. Use DRY=0 to commit.
//   node scripts/cleanup-qa-test-data.cjs        (dry run)
//   DRY=0 node scripts/cleanup-qa-test-data.cjs   (delete for real)
const { Client } = require("pg");
const DRY = process.env.DRY !== "0";
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const q = async (s, p) => (await c.query(s, p)).rows;
  const ids = async (s, p) => (await q(s, p)).map((r) => r.id);
  const rep = [];
  const del = async (label, sql, p) => { const r = await c.query(sql, p); rep.push(label + "=" + r.rowCount); };
  await c.query("begin");
  try {
    const vids = await ids("select id from vendors where name like 'QA-TEST%'");
    const cids = await ids("select id from customers where name like 'QA-TEST%'");
    const pids = await ids("select id from products where sku='QA-SKU-001' or name like 'QA-TEST%'");
    const variants = await ids("select id from product_variants where product_id = any($1)", [pids]);
    const wids = await ids("select id from warehouses where name like 'QA-TEST%'");
    const poids = await ids("select id from purchase_orders where vendor_id = any($1)", [vids]);
    const soids = await ids("select id from sales_orders where customer_id = any($1)", [cids]);
    const iids = await ids("select id from invoices where customer_id = any($1)", [cids]);
    const vmids = await ids("select id from vehicle_movements where invoice_no = any($1::text[]) or dispatch_no = 'SD-073332'", [soids]);
    const grns = await ids("select id from goods_receipts where vendor_id = any($1) or purchase_order_id = any($2)", [vids, poids]);
    const bills = await ids("select id from purchase_bills where vendor_id = any($1) or po_id = any($2)", [vids, poids]);
    const docIds = [...iids, ...soids, ...poids, ...vmids, ...grns, ...bills, ...pids];
    const docNos = [
      ...(await q("select invoice_no n from invoices where id = any($1)", [iids])).map((r) => r.n),
      ...(await q("select order_no n from sales_orders where id = any($1)", [soids])).map((r) => r.n),
      ...(await q("select po_no n from purchase_orders where id = any($1)", [poids])).map((r) => r.n),
      ...(await q("select bill_no n from purchase_bills where id = any($1)", [bills])).map((r) => r.n),
      ...(await q("select grn_no n from goods_receipts where id = any($1)", [grns])).map((r) => r.n),
    ];
    const txIds = [...new Set([
      ...(await ids("select id from inventory_transactions where doc_id = any($1)", [docIds])),
      ...(await q("select transaction_id id from inventory_ledger where variant_id = any($1)", [variants])).map((r) => r.id),
    ])];
    rep.push("FOUND vendors=" + vids.length + " customers=" + cids.length + " products=" + pids.length + " variants=" + variants.length + " warehouses=" + wids.length + " po=" + poids.length + " so=" + soids.length + " invoices=" + iids.length + " deliveries=" + vmids.length + " grn=" + grns.length + " bills=" + bills.length + " invTx=" + txIds.length + " docNos=" + docNos.join("/"));

    await del("inventory_ledger", "delete from inventory_ledger where transaction_id = any($1) or variant_id = any($2)", [txIds, variants]);
    await del("inventory_transactions", "delete from inventory_transactions where id = any($1)", [txIds]);
    await del("stock_batches", "delete from stock_batches where stock_id in (select id from stock where variant_id = any($1) or warehouse_id = any($2))", [variants, wids]);
    await del("stock", "delete from stock where variant_id = any($1) or warehouse_id = any($2)", [variants, wids]);
    await del("tax_transactions", "delete from tax_transactions where invoice_id = any($1)", [iids]);
    await del("payment_allocations", "delete from payment_allocations where invoice_id = any($1)", [iids]);
    await del("invoice_items", "delete from invoice_items where invoice_id = any($1)", [iids]);
    await del("journal_entries", "delete from journal_entries where reference = any($1) or description like '%QA-TEST%'", [docNos]);
    await del("invoices", "delete from invoices where id = any($1)", [iids]);
    await del("sales_order_items", "delete from sales_order_items where order_id = any($1)", [soids]);
    await del("sales_orders", "delete from sales_orders where id = any($1)", [soids]);
    await del("vehicle_movements", "delete from vehicle_movements where id = any($1)", [vmids]);
    await del("purchase_bill_items", "delete from purchase_bill_items where bill_id = any($1)", [bills]);
    await del("purchase_bills", "delete from purchase_bills where id = any($1)", [bills]);
    await del("goods_receipt_items", "delete from goods_receipt_items where grn_id = any($1) or variant_id = any($2)", [grns, variants]);
    await del("goods_receipts", "delete from goods_receipts where id = any($1)", [grns]);
    await del("purchase_order_items", "delete from purchase_order_items where po_id = any($1) or variant_id = any($2)", [poids, variants]);
    await del("purchase_orders", "delete from purchase_orders where id = any($1)", [poids]);
    await del("approval_requests", "delete from approval_requests where doc_id = any($1)", [docIds]);
    await del("product_barcodes", "delete from product_barcodes where product_id = any($1)", [pids]);
    await del("product_variants", "delete from product_variants where id = any($1)", [variants]);
    await del("products", "delete from products where id = any($1)", [pids]);
    await del("bins", "delete from bins where rack_id in (select r.id from racks r join warehouse_locations l on l.id = r.location_id where l.warehouse_id = any($1))", [wids]);
    await del("racks", "delete from racks where location_id in (select id from warehouse_locations where warehouse_id = any($1))", [wids]);
    await del("warehouse_locations", "delete from warehouse_locations where warehouse_id = any($1)", [wids]);
    await del("warehouses", "delete from warehouses where id = any($1)", [wids]);
    await del("tally_sync_logs", "delete from tally_sync_logs where queue_id in (select id from tally_sync_queue where entity_id = any($1))", [[...vids, ...cids, ...pids, ...iids]]);
    await del("tally_sync_queue", "delete from tally_sync_queue where entity_id = any($1)", [[...vids, ...cids, ...pids, ...iids]]);
    await del("tally_entity_mappings", "delete from tally_entity_mappings where entity_id = any($1)", [[...vids, ...cids, ...pids, ...iids]]);
    await del("vendors", "delete from vendors where id = any($1)", [vids]);
    await del("customers", "delete from customers where id = any($1)", [cids]);
    await del("categories", "delete from categories where name like 'QA-TEST%'");
    await del("brands", "delete from brands where name like 'QA-TEST%'");
    await del("units", "delete from units where name like 'QA-TEST%'");
    await del("activity_logs", "delete from activity_logs where description like '%QA-TEST%' or (module = 'ATTENDANCE' and timestamp >= '2026-10-28') or exists (select 1 from unnest($1::text[]) d where position(d in description) > 0)", [docIds]);
    console.log(rep.join("\n"));
    if (DRY) { await c.query("rollback"); console.log("DRY RUN: rolled back, nothing deleted."); }
    else { await c.query("commit"); console.log("COMMITTED."); }
  } catch (e) {
    await c.query("rollback");
    console.log("ERROR, rolled back:", e.message);
  }
  await c.end();
})();
