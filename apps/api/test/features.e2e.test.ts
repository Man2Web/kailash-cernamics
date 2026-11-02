import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { FEATURE_KEYS } from "@gc/shared";
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
    await owner.put("/api/features", Object.fromEntries(FEATURE_KEYS.map((k) => [k, true])));
    await t.app.close();
  });

  it("everything is on until the Super Admin turns something off, and anyone signed in can read the switches", async () => {
    const f = await manager.get("/api/features");
    expect(f.status).toBe(200);
    for (const k of FEATURE_KEYS) expect(f.body[k]).toBe(true);
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
});
