/**
 * Regression tests for auth scoping, QR parsing, attendance, reservations and stock movement.
 * Runs against a DEVELOPMENT PostgreSQL only (set DATABASE_URL to a local DB). It refuses to run otherwise.
 *
 *   DATABASE_URL=postgresql://... ATTENDANCE_QR_SECRET=test npm test
 *
 * Every row it creates is tagged "QAREG" and removed at the end.
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

const url = process.env.DATABASE_URL || "";
if (!/(localhost|127\.0\.0\.1|\[::1\])/.test(url)) {
  throw new Error("Refusing to run: DATABASE_URL must point at a local development database.");
}
process.env.ATTENDANCE_QR_SECRET ||= "test-secret-not-for-production";

import db from "../../src/lib/db/db";
import { classifyScan } from "../../src/lib/products/qr-parse";
import { matchesWarehouse } from "../../src/lib/inventory/warehouse-scope";
import { warehouseScopeId, warehouseAccessError, NO_WAREHOUSE, isAttendanceDisplay } from "../../src/lib/auth/auth";
import { toAssignableRole, isAssignableRole } from "../../src/lib/auth/access";
import { effectivePermissions, sanitizePermissionCodes, ROLE_PRESETS } from "../../src/lib/auth/permissions";
import {
  reserveStock,
  releaseReservation,
  releaseReservationsForOrder,
  getActiveReservations,
  recordStockAdjustment,
  recordStockTransfer,
} from "../../src/lib/inventory/movement";
import { generateDynamicAttendanceToken, validateAttendanceToken } from "../../src/lib/attendance/token";
import { markEmployeeCheckIn } from "../../src/lib/attendance/attendance";

const TAG = "QAREG" + randomBytes(3).toString("hex").toUpperCase();
const d: any = db;
const F: any = {};

const session = (roles: string[], warehouseId = "", warehouseName = "") =>
  ({ user: { id: "u", roles, permissions: [], warehouseId, warehouseName } }) as any;

async function stockQty(variantId: string, warehouseId: string) {
  const rows = await d.stock.findMany({ where: { variantId, warehouseId } });
  return rows.reduce((n: number, r: any) => n + Number(r.quantity), 0);
}

async function makeOrder(label: string) {
  return d.salesOrder.create({
    data: { orderNo: `${TAG}-${label}`, customerId: F.customer.id, branchId: F.branch.id, outletId: F.outlet.id, status: "CONFIRMED" },
  });
}

before(async () => {
  F.customer = await d.customer.findFirst();
  F.branch = await d.branch.findFirst();
  F.outlet = await d.outlet.findFirst();
  const cat = await d.category.findFirst();
  const unit = await d.unit.findFirst();
  const whs = await d.warehouse.findMany({ take: 2, orderBy: { code: "asc" } });
  assert.ok(F.customer && F.branch && F.outlet && cat && unit && whs.length === 2, "dev DB needs seed data");
  [F.whA, F.whB] = whs;
  F.product = await d.product.create({
    data: { categoryId: cat.id, unitId: unit.id, name: `${TAG} Tile`, sku: `${TAG}-SKU`, code: `${TAG}-CODE`, purchasePrice: 10, sellingPrice: 20, mrp: 25, gstRate: 18, minStock: 0, reorderLevel: 0 },
  });
  F.variant = await d.productVariant.create({ data: { productId: F.product.id, name: "Standard", sku: `${TAG}-SKU`, barcode: `${TAG}-SKU` } });
  await d.stock.create({ data: { productId: F.product.id, variantId: F.variant.id, warehouseId: F.whA.id, quantity: 10 } });
});

after(async () => {
  const pid = F.product?.id;
  if (pid) {
    const txns = await d.inventoryTransaction.findMany({ where: { OR: [{ remarks: { contains: pid } }, { docId: F.variant?.id }] } });
    await d.inventoryLedger.deleteMany({ where: { variantId: F.variant.id } });
    for (const t of txns) await d.inventoryTransaction.delete({ where: { id: t.id } }).catch(() => {});
    await d.stock.deleteMany({ where: { productId: pid } });
    await d.salesOrderItem.deleteMany({ where: { variantId: F.variant.id } });
  }
  const orders = await d.salesOrder.findMany({ where: { orderNo: { startsWith: TAG } } });
  for (const o of orders) {
    const res = await d.inventoryTransaction.findMany({ where: { docId: o.id } });
    for (const r of res) await d.inventoryTransaction.delete({ where: { id: r.id } }).catch(() => {});
    await d.salesOrder.delete({ where: { id: o.id } }).catch(() => {});
  }
  if (pid) {
    await d.productVariant.deleteMany({ where: { productId: pid } });
    await d.product.delete({ where: { id: pid } }).catch(() => {});
  }
  await d.activityLog.deleteMany({ where: { module: "ATTENDANCE", description: { contains: TAG } } });
  await d.employee.deleteMany({ where: { employeeNo: { startsWith: TAG } } });
  await d.$disconnect?.();
});

// ---------------------------------------------------------------- auth & permissions
test("permissions: Sales preset cannot change order status or manage warehouse", () => {
  const p = effectivePermissions(["SALES_PERSON"], null);
  assert.ok(!p.includes("sales:status"));
  assert.ok(!p.includes("warehouse:manage"));
});

test("permissions: individually chosen codes replace the role preset and unknown codes are dropped", () => {
  assert.deepEqual(sanitizePermissionCodes(["stock:view", "nope:nope", "stock:view"]).sort(), ["stock:view"]);
  const p = effectivePermissions(["SALES_PERSON"], ["stock:view"]);
  assert.ok(p.includes("stock:view"));
  assert.ok(Object.keys(ROLE_PRESETS).length > 0);
});

test("warehouse scope: manager sees only their warehouse; unassigned manager fails closed; admin unrestricted", () => {
  assert.equal(warehouseScopeId(session(["WAREHOUSE_MANAGER"], "w1", "WH One")), "w1");
  assert.equal(warehouseScopeId(session(["WAREHOUSE_MANAGER"], "", "")), NO_WAREHOUSE);
  assert.equal(warehouseScopeId(session(["WAREHOUSE_MANAGER"], "w1", "")), NO_WAREHOUSE, "inactive/deleted warehouse");
  assert.equal(warehouseScopeId(session(["SUPER_ADMIN"])), undefined);
  assert.equal(warehouseScopeId(session(["SALES_PERSON"])), undefined);
});

test("warehouse access: manager is blocked from another warehouse and when unassigned", () => {
  const mgr = session(["WAREHOUSE_MANAGER"], "w1", "WH One");
  assert.equal(warehouseAccessError(mgr, "w1"), null);
  assert.match(warehouseAccessError(mgr, "w2")!, /assigned warehouse/);
  assert.match(warehouseAccessError(mgr, "")!, /assigned warehouse/);
  assert.match(warehouseAccessError(session(["WAREHOUSE_MANAGER"]), "w1")!, /not been assigned/);
  assert.equal(warehouseAccessError(session(["SUPER_ADMIN"]), "anything"), null);
});

test("delivery source matching is exact, never fuzzy and never matches blanks", () => {
  assert.equal(matchesWarehouse("Main Warehouse", "w1", "Main Warehouse"), true);
  assert.equal(matchesWarehouse("main warehouse ", "w1", "Main Warehouse"), true);
  assert.equal(matchesWarehouse("Main", "w1", "Main Warehouse"), false);
  assert.equal(matchesWarehouse("", "w1", "Main Warehouse"), false);
  assert.equal(matchesWarehouse(null, "w1", undefined), false);
  assert.equal(matchesWarehouse("w1", "w1", undefined), true);
});

// ---------------------------------------------------------------- QR parsing
test("QR: product tokens, attendance QRs and junk are told apart", () => {
  assert.equal(classifyScan("PROD-QR-A1B2C3D4E5F6").kind, "product-token");
  assert.equal(classifyScan("  prod-qr-a1b2c3d4e5f6 ").value, "PROD-QR-A1B2C3D4E5F6");
  assert.equal(classifyScan("https://kailash.example.com/attendance?t=abc").kind, "attendance");
  assert.equal(classifyScan("SKU-1234").kind, "other");
  assert.equal(classifyScan("").kind, "other");
  assert.equal(classifyScan("PROD-QR-").kind, "other");
});

// ---------------------------------------------------------------- attendance
test("attendance token: valid token accepted; forged and malformed tokens rejected", async () => {
  const { token } = await generateDynamicAttendanceToken();
  assert.equal((await validateAttendanceToken(token)).valid, true);
  const forged = token.slice(0, -4) + "0000";
  assert.equal((await validateAttendanceToken(forged)).valid, false);
  assert.equal((await validateAttendanceToken("garbage")).valid, false);
  assert.equal((await validateAttendanceToken("")).valid, false);
});

test("attendance check-in: concurrent scans create exactly one record, later scans say already checked in", async () => {
  const emp = await d.employee.create({
    data: { employeeNo: `${TAG}-E1`, name: `${TAG} Person`, email: `${TAG.toLowerCase()}@example.test`, phone: "9000000001", department: "SALES", jobTitle: "Tester", salary: 1 },
  });
  const results = await Promise.all(Array.from({ length: 5 }, () => markEmployeeCheckIn({ identifier: emp.employeeNo, method: "QR" })));
  assert.equal(results.filter((r) => r.success).length, 1, "exactly one scan succeeds");
  assert.equal(results.filter((r) => r.alreadyCheckedIn).length, 4);
  const logs = await d.activityLog.findMany({ where: { module: "ATTENDANCE", description: { contains: emp.employeeNo } } });
  assert.equal(logs.length, 1, "one row persisted in PostgreSQL");
  const rec = JSON.parse(logs[0].description);
  assert.match(rec.attendanceDate, /^\d{4}-\d{2}-\d{2}$/);
});

test("attendance check-in: unknown identifier is rejected with a message", async () => {
  const r = await markEmployeeCheckIn({ identifier: `${TAG}-NOPE`, method: "QR" });
  assert.equal(r.success, false);
  assert.ok(r.message);
});

// ---------------------------------------------------------------- reservations & stock
const baseRes = (orderId: string, orderNo: string, quantity: number, warehouseId = F.whA?.id) => ({
  salesOrderId: orderId,
  orderNo,
  customerName: "QA",
  variantId: F.variant.id,
  productId: "",
  warehouseId,
  quantity,
  expectedPickupDate: new Date(Date.now() + 86400000),
  expiryDate: new Date(Date.now() + 3 * 86400000),
});

test("reservation: validates input and never changes physical stock", async () => {
  const o = await makeOrder("V");
  await assert.rejects(() => reserveStock({ ...baseRes(o.id, o.orderNo, 0) }), /greater than zero/);
  await assert.rejects(() => reserveStock({ ...baseRes(o.id, o.orderNo, -3) }), /greater than zero/);
  await assert.rejects(() => reserveStock({ ...baseRes(o.id, o.orderNo, 1, "") }), /warehouse/i);
  await assert.rejects(() => reserveStock({ ...baseRes(o.id, o.orderNo, 1), variantId: "" }), /product/i);
  await assert.rejects(() => reserveStock({ ...baseRes(o.id, o.orderNo, 11) }), /Not enough stock/);
  assert.equal(await stockQty(F.variant.id, F.whA.id), 10);
  assert.equal((await getActiveReservations(F.whA.id))[`${F.variant.id}_${F.whA.id}`] || 0, 0);
});

test("reservation: reserve, block duplicate, release; stock on hand is untouched", async () => {
  const o = await makeOrder("R1");
  const r = await reserveStock({ ...baseRes(o.id, o.orderNo, 4) });
  assert.equal((await getActiveReservations(F.whA.id))[`${F.variant.id}_${F.whA.id}`], 4);
  await assert.rejects(() => reserveStock({ ...baseRes(o.id, o.orderNo, 1) }), /already has an active reservation/);
  assert.equal(await stockQty(F.variant.id, F.whA.id), 10);
  const so = await d.salesOrder.findUnique({ where: { id: o.id } });
  assert.equal(so.status, "RESERVED");
  await releaseReservation(r.transactionId);
  assert.equal((await getActiveReservations(F.whA.id))[`${F.variant.id}_${F.whA.id}`] || 0, 0);
  await assert.rejects(() => releaseReservation(r.transactionId), /already/);
});

test("reservation: cancelling an order releases its stock and a released cancelled order is not revived", async () => {
  const o = await makeOrder("C1");
  await reserveStock({ ...baseRes(o.id, o.orderNo, 3) });
  await d.salesOrder.update({ where: { id: o.id }, data: { status: "CANCELLED" } });
  assert.equal(await releaseReservationsForOrder(o.id, "cancelled"), 1);
  assert.equal((await getActiveReservations(F.whA.id))[`${F.variant.id}_${F.whA.id}`] || 0, 0);
  assert.equal(await releaseReservationsForOrder(o.id, "again"), 0, "idempotent");
  assert.equal((await d.salesOrder.findUnique({ where: { id: o.id } })).status, "CANCELLED");
});

test("reservation: concurrent orders cannot oversell the last units", async () => {
  const orders = await Promise.all([1, 2, 3, 4, 5, 6].map((i) => makeOrder(`P${i}`)));
  // 10 on hand, 4 units each: at most two can succeed
  const results = await Promise.allSettled(orders.map((o) => reserveStock({ ...baseRes(o.id, o.orderNo, 4) })));
  const ok = results.filter((r) => r.status === "fulfilled").length;
  assert.equal(ok, 2, `expected exactly 2 successes, got ${ok}`);
  assert.equal((await getActiveReservations(F.whA.id))[`${F.variant.id}_${F.whA.id}`], 8);
  for (const o of orders) await releaseReservationsForOrder(o.id, "test cleanup");
  assert.equal(await stockQty(F.variant.id, F.whA.id), 10);
});

test("stock adjustment: rejects negative counts, uses live quantity, leaves a ledger entry", async () => {
  await assert.rejects(() => recordStockAdjustment({ productId: F.product.id, variantId: F.variant.id, warehouseId: F.whA.id, physicalQty: -1, currentQty: 10 }), /negative/);
  await recordStockAdjustment({ productId: F.product.id, variantId: F.variant.id, warehouseId: F.whA.id, physicalQty: 12, currentQty: 999 /* stale on purpose */ });
  assert.equal(await stockQty(F.variant.id, F.whA.id), 12);
  await recordStockAdjustment({ productId: F.product.id, variantId: F.variant.id, warehouseId: F.whA.id, physicalQty: 10, currentQty: 12 });
  assert.equal(await stockQty(F.variant.id, F.whA.id), 10);
  const ledger = await d.inventoryLedger.findMany({ where: { variantId: F.variant.id } });
  assert.equal(ledger.reduce((n: number, l: any) => n + Number(l.quantity), 0), 0, "net ledger of +2 and -2");
});

test("stock transfer: cannot move reserved or non-existent stock, failures change nothing, success moves exactly", async () => {
  const o = await makeOrder("T1");
  const res = await reserveStock({ ...baseRes(o.id, o.orderNo, 8) });
  const t = (qty: number, to = F.whB.id) =>
    recordStockTransfer({ transferNo: `${TAG}-TR-${randomBytes(2).toString("hex")}`, sourceWarehouseId: F.whA.id, destWarehouseId: to, items: [{ productId: F.product.id, variantId: F.variant.id, quantity: qty }] });
  await assert.rejects(() => t(5), /Insufficient free stock/);
  await assert.rejects(() => t(0), /greater than zero/);
  await assert.rejects(() => t(1, F.whA.id), /different/);
  assert.equal(await stockQty(F.variant.id, F.whA.id), 10);
  assert.equal(await stockQty(F.variant.id, F.whB.id), 0, "failed transfer left no partial rows");
  await t(2);
  assert.equal(await stockQty(F.variant.id, F.whA.id), 8);
  assert.equal(await stockQty(F.variant.id, F.whB.id), 2);
  await releaseReservation(res.transactionId);
  await t(2).catch(() => {});
  // put things back for any following test
  await recordStockAdjustment({ productId: F.product.id, variantId: F.variant.id, warehouseId: F.whA.id, physicalQty: 10, currentQty: 0 });
  await d.stock.deleteMany({ where: { variantId: F.variant.id, warehouseId: F.whB.id } });
});

test("warehouse scope: the fail-closed marker is a valid UUID that Postgres accepts and that matches nothing", async () => {
  assert.match(NO_WAREHOUSE, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  assert.deepEqual(await d.stock.findMany({ where: { warehouseId: NO_WAREHOUSE } }), []);
  assert.deepEqual(await d.warehouse.findMany({ where: { id: NO_WAREHOUSE } }), []);
});

test("attendance QR screen login: only the dedicated role qualifies, it holds no permissions, Super Admin does not qualify", () => {
  assert.equal(isAttendanceDisplay(session(["ATTENDANCE_DISPLAY"])), true);
  assert.equal(isAttendanceDisplay(session(["SUPER_ADMIN"])), false);
  assert.equal(isAttendanceDisplay(session(["SALES_PERSON", "ATTENDANCE_MANAGER"])), false);
  assert.equal(isAttendanceDisplay(null), false);
  assert.ok(isAssignableRole("ATTENDANCE_DISPLAY"));
  assert.equal(toAssignableRole("attendance display"), "ATTENDANCE_DISPLAY");
  assert.deepEqual(effectivePermissions(["ATTENDANCE_DISPLAY"], null), []);
  assert.deepEqual(effectivePermissions(["ATTENDANCE_DISPLAY"], []), []);
});
