import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { ALL_FEATURE_KEYS, FEATURE_KEYS, FEATURE_PART_KEYS } from "@gc/shared";
import { createTestApp, loginAs, TestCtx } from "./helpers";

describe("module on/off switches (Super Admin only)", () => {
  let t: TestCtx;
  let owner: Awaited<ReturnType<typeof loginAs>>;
  let manager: Awaited<ReturnType<typeof loginAs>>;

  beforeAll(async () => {
    t = await createTestApp();
    owner = await loginAs(t.app);
    manager = await loginAs(t.app, "manager@kailashceramics.com");
  });
  afterAll(async () => {
    await owner.put("/api/features", Object.fromEntries(ALL_FEATURE_KEYS.map((k) => [k, true])));
    await t.app.close();
  });

  it("everything is on until the Super Admin turns something off, and anyone signed in can read the switches", async () => {
    const f = await manager.get("/api/features");
    expect(f.status).toBe(200);
    for (const k of ALL_FEATURE_KEYS) expect(f.body[k]).toBe(true);
    expect(FEATURE_KEYS.length + FEATURE_PART_KEYS.length).toBe(ALL_FEATURE_KEYS.length);
    expect((await request(t.app.getHttpServer()).get("/api/features")).status).toBe(401);
  });

  it("only the Super Admin can change them, and every change is audited", async () => {
    expect((await manager.put("/api/features", { sales: false })).status).toBe(403);
    expect((await manager.get("/api/features")).body.sales).toBe(true);
    const bad = await owner.put("/api/features", { sales: "nope" });
    expect(bad.status).toBe(400);
    const ok = await owner.put("/api/features", { crm: false });
    expect(ok.status).toBe(200);
    expect(ok.body.crm).toBe(false);
    expect(await t.prisma.auditLog.count({ where: { entity: "setting", entityId: "features", action: "set_features" } })).toBe(1);
    await owner.put("/api/features", { crm: true });
  });

  it("the general settings endpoint cannot be used to flip a module switch", async () => {
    const res = await owner.put("/api/settings", { "feature.sales": false, "wastage.floor": 6 });
    expect(res.status).toBe(200);
    expect((await owner.get("/api/features")).body.sales).toBe(true);
  });

  it("turning a module off refuses its routes for everyone, including the Super Admin, and leaves the rest working", async () => {
    expect((await owner.get("/api/quotations")).status).toBe(200);
    await owner.put("/api/features", { sales: false });
    for (const who of [owner, manager]) {
      const res = await who.get("/api/quotations");
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/Sales is turned off/);
      expect((await who.get("/api/invoices")).status).toBe(403);
      expect((await who.post("/api/sales-orders", {})).status).toBe(403);
    }
    // Other modules, the catalogue, customers and settings are untouched, and the switches stay reachable.
    expect((await owner.get("/api/products")).status).toBe(200);
    expect((await owner.get("/api/parties")).status).toBe(200);
    expect((await owner.get("/api/stock/ledger")).status).toBe(200);
    expect((await owner.get("/api/users")).status).toBe(200);
    expect((await owner.get("/api/features")).status).toBe(200);
    // Back on: everything returns.
    await owner.put("/api/features", { sales: true });
    expect((await owner.get("/api/quotations")).status).toBe(200);
  });

  it("each module maps to its own routes: purchase, inventory, accounts, CRM, reports", async () => {
    const cases: [string, string][] = [
      ["purchase", "/api/purchase-orders"],
      ["inventory", "/api/stock/ledger"],
      ["accounts", "/api/receipts"],
      ["crm", "/api/leads"],
      ["reports", "/api/reports"],
    ];
    for (const [feature, path] of cases) {
      expect((await owner.get(path)).status, `${path} on`).toBe(200);
      await owner.put("/api/features", { [feature]: false });
      expect((await owner.get(path)).status, `${path} off`).toBe(403);
      await owner.put("/api/features", { [feature]: true });
      expect((await owner.get(path)).status, `${path} back on`).toBe(200);
    }
  });

  it("Tally off: its pages and the desktop agent are refused and the dashboard hides it, even for the Super Admin", async () => {
    expect((await owner.get("/api/dashboard")).body.tally).not.toBeNull();
    await owner.put("/api/features", { tally: false });
    expect((await owner.get("/api/tally/sync")).status).toBe(403);
    const agent = await request(t.app.getHttpServer()).get("/api/tally/queue").set("X-Agent-Key", "gcta_anything");
    expect(agent.status).toBe(403); // refused as "turned off", not as a bad key
    expect((await owner.get("/api/dashboard")).body.tally).toBeNull();
    await owner.put("/api/features", { tally: true });
    expect((await owner.get("/api/tally/sync")).status).toBe(200);
  });

  it("Office off: employees and the public attendance scan are refused, and attendance returns when it is back on", async () => {
    await owner.put("/api/features", { office: false });
    expect((await owner.get("/api/employees")).status).toBe(403);
    expect((await owner.get("/api/attendance/today")).status).toBe(403);
    const scan = await request(t.app.getHttpServer()).post("/api/attendance/public/verify").set("Idempotency-Key", "k1").send({ token: "x" });
    expect(scan.status).toBe(403);
    await owner.put("/api/features", { office: true });
    expect((await owner.get("/api/employees")).status).toBe(200);
  });

  it("one part of a module can be off on its own: Sales on, Invoices off", async () => {
    expect((await owner.get("/api/invoices")).status).toBe(200);
    const off = await owner.put("/api/features", { "sales.invoices": false });
    expect(off.status).toBe(200);
    expect(off.body["sales.invoices"]).toBe(false);
    expect(off.body.sales).toBe(true);
    for (const who of [owner, manager]) {
      const res = await who.get("/api/invoices");
      expect(res.status).toBe(403);
      expect(res.body.message).toBe("Invoices is turned off by the Super Admin.");
    }
    // creating an invoice from an order is an invoice action too
    const fromOrder = await owner.post("/api/sales-orders/00000000-0000-0000-0000-000000000000/invoice", {});
    expect(fromOrder.status).toBe(403);
    // the other sales parts keep working
    for (const path of ["/api/quotations", "/api/sales-orders", "/api/challans", "/api/sales-returns"]) expect((await owner.get(path)).status, path).toBe(200);
    // and so does everything outside Sales
    expect((await owner.get("/api/receipts")).status).toBe(200);
    expect((await owner.get("/api/outstanding")).status).toBe(200);
  });

  it("the switch is saved, and turning it on again brings the part back", async () => {
    const row = await t.prisma.setting.findUnique({ where: { key: "feature.sales.invoices" } });
    expect(row?.value).toBe(false);
    expect((await manager.get("/api/features")).body["sales.invoices"]).toBe(false);
    const on = await owner.put("/api/features", { "sales.invoices": true });
    expect(on.body["sales.invoices"]).toBe(true);
    expect((await owner.get("/api/invoices")).status).toBe(200);
    expect((await t.prisma.setting.findUnique({ where: { key: "feature.sales.invoices" } }))?.value).toBe(true);
  });

  it("a module that is off switches all its parts off, and each part keeps its own setting for when it returns", async () => {
    await owner.put("/api/features", { "sales.challans": false });
    await owner.put("/api/features", { sales: false });
    for (const path of ["/api/quotations", "/api/invoices", "/api/challans"]) expect((await owner.get(path)).status, `${path} (module off)`).toBe(403);
    const saved = (await owner.get("/api/features")).body;
    expect(saved["sales.quotations"]).toBe(true); // its own setting is untouched
    expect(saved["sales.challans"]).toBe(false);
    await owner.put("/api/features", { sales: true });
    expect((await owner.get("/api/quotations")).status).toBe(200);
    expect((await owner.get("/api/invoices")).status).toBe(200);
    expect((await owner.get("/api/challans")).status).toBe(403); // still off, as it was left
    await owner.put("/api/features", { "sales.challans": true });
    expect((await owner.get("/api/challans")).status).toBe(200);
  });

  it("an action that creates another document needs that document's switch", async () => {
    await owner.put("/api/features", { "sales.orders": false });
    expect((await owner.post("/api/quotations/00000000-0000-0000-0000-000000000000/convert", {})).status).toBe(403);
    expect((await owner.get("/api/quotations")).status).toBe(200);
    await owner.put("/api/features", { "sales.orders": true });
    await owner.put("/api/features", { "sales.quotations": false });
    expect((await owner.post("/api/leads/00000000-0000-0000-0000-000000000000/convert", {})).status).toBe(403);
    expect((await owner.get("/api/leads")).status).toBe(200);
    await owner.put("/api/features", { "sales.quotations": true });
  });

  it("parts of the other modules switch separately too", async () => {
    const cases: [string, string, string][] = [
      ["inventory.transfers", "/api/stock/transfers", "/api/stock/ledger"],
      ["inventory.adjustments", "/api/stock/adjustments", "/api/stock/transfers"],
      ["purchase.grn", "/api/grns", "/api/purchase-orders"],
      ["accounts.payments", "/api/payments", "/api/receipts"],
      ["crm.followups", "/api/followups", "/api/leads"],
      ["office.attendance", "/api/attendance/today", "/api/employees"],
    ];
    for (const [key, off, stillOn] of cases) {
      await owner.put("/api/features", { [key]: false });
      expect((await owner.get(off)).status, `${off} with ${key} off`).toBe(403);
      expect((await owner.get(stillOn)).status, `${stillOn} with ${key} off`).toBe(200);
      await owner.put("/api/features", { [key]: true });
      expect((await owner.get(off)).status, `${off} with ${key} on`).toBe(200);
    }
  });

  it("only the Super Admin can switch a part, bad values are refused, and each change is audited", async () => {
    expect((await manager.put("/api/features", { "sales.invoices": false })).status).toBe(403);
    expect((await manager.get("/api/features")).body["sales.invoices"]).toBe(true);
    expect((await owner.put("/api/features", { "sales.invoices": "nope" })).status).toBe(400);
    const before = await t.prisma.auditLog.count({ where: { entity: "setting", entityId: "features", action: "set_features" } });
    await owner.put("/api/features", { "sales.returns": false });
    expect(await t.prisma.auditLog.count({ where: { entity: "setting", entityId: "features", action: "set_features" } })).toBe(before + 1);
    await owner.put("/api/features", { "sales.returns": true });
  });
});
