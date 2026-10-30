import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, loginAs, TestCtx } from "./helpers";
import request from "supertest";

describe("auth, permissions, idempotency, audit", () => {
  let t: TestCtx;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.app.close();
  });

  it("health is public", async () => {
    const res = await request(t.app.getHttpServer()).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("rejects wrong password and records login history", async () => {
    const res = await request(t.app.getHttpServer()).post("/api/auth/login").send({ email: "admin@kailashceramics.com", password: "nope" });
    expect(res.status).toBe(401);
    const ev = await t.prisma.loginEvent.findFirst({ where: { email: "admin@kailashceramics.com", success: false } });
    expect(ev).toBeTruthy();
  });

  it("logs in, returns session with permissions, and refresh rotates tokens", async () => {
    const owner = await loginAs(t.app);
    expect(owner.user.role.code).toBe("OWNER");
    expect(owner.user.permissions).toContain("catalogue.write");
    const me = await owner.get("/api/auth/me");
    expect(me.status).toBe(200);
    const r1 = await owner.agent.post("/api/auth/refresh");
    expect(r1.status).toBe(200);
  });

  it("detects refresh token reuse", async () => {
    const server = t.app.getHttpServer();
    const login = await request(server).post("/api/auth/login").send({ email: "sales@kailashceramics.com", password: "Kailash@123" });
    const rt = (login.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith("gc_rt="))!.split(";")[0];
    const first = await request(server).post("/api/auth/refresh").set("Cookie", rt);
    expect(first.status).toBe(200);
    const reuse = await request(server).post("/api/auth/refresh").set("Cookie", rt);
    expect(reuse.status).toBe(401);
  });

  it("requires login and permission", async () => {
    const anon = await request(t.app.getHttpServer()).get("/api/brands");
    expect(anon.status).toBe(401);
    const godown = await loginAs(t.app, "godown@kailashceramics.com");
    const denied = await godown.post("/api/brands", { name: "X" });
    expect(denied.status).toBe(403);
  });

  it("requires Idempotency-Key and replays the first response", async () => {
    const owner = await loginAs(t.app);
    const noKey = await owner.agent.post("/api/brands").send({ name: "Kajaria" });
    expect(noKey.status).toBe(400);
    const a = await owner.post("/api/brands", { name: "Kajaria" }, "brand-key-0001");
    expect(a.status).toBe(201);
    const b = await owner.post("/api/brands", { name: "Kajaria" }, "brand-key-0001");
    expect(b.status).toBe(201);
    expect(b.body.id).toBe(a.body.id);
    expect(await t.prisma.brand.count({ where: { name: "Kajaria" } })).toBe(1);
    const audit = await t.prisma.auditLog.findFirst({ where: { entity: "brand", entityId: a.body.id, action: "create" } });
    expect(audit?.userId).toBe(owner.user.id);
  });

  it("ledger: unracked withdrawals draw from rack balances and never go negative", async () => {
    const { LedgerService } = await import("../src/core/ledger.service");
    const ledger = t.app.get(LedgerService);
    const brand = await t.prisma.brand.create({ data: { name: "LedgerTest" } });
    const cat = await t.prisma.category.create({ data: { name: "LedgerTiles", type: "TILE" } });
    const product = await t.prisma.product.create({
      data: { sku: "LT-1", name: "Ledger tile", brandId: brand.id, categoryId: cat.id, hsn: "6907", gstRate: 18, uomType: "PIECE_BOX_AREA", pcsPerBox: 4, sqftPerBox: 15.5 },
    });
    const batch = await t.prisma.batch.create({ data: { productId: product.id, batchNo: "B1", shadeCode: "S1", caliber: "C1" } });
    const racks = await t.prisma.rack.findMany({ where: { godownId: t.base.mainGodown.id }, orderBy: { code: "asc" } });
    const base = { branchId: t.base.branch.id, productId: product.id, batchId: batch.id, godownId: t.base.mainGodown.id, stockType: "SALEABLE" as const, refType: "TEST", refId: "t1" };
    await t.prisma.$transaction((tx) => ledger.post(tx, [{ ...base, rackId: racks[0].id, qtyPcs: 10 }, { ...base, rackId: racks[1].id, qtyPcs: 6 }]));
    await t.prisma.$transaction((tx) => ledger.post(tx, [{ ...base, qtyPcs: -12 }]));
    const bals = await t.prisma.stockBalance.findMany({ where: { productId: product.id }, orderBy: { qtyPcs: "asc" } });
    expect(bals.map((b) => b.qtyPcs).reduce((a, b) => a + b, 0)).toBe(4);
    expect(bals.every((b) => b.qtyPcs >= 0)).toBe(true);
    await expect(t.prisma.$transaction((tx) => ledger.post(tx, [{ ...base, qtyPcs: -5 }]))).rejects.toThrow(/Not enough/);
  });

  it("lists with search and paging, soft-deletes", async () => {
    const owner = await loginAs(t.app);
    await owner.post("/api/brands", { name: "Somany" });
    const list = await owner.get("/api/brands?q=som&pageSize=10");
    expect(list.body.total).toBe(1);
    const id = list.body.items[0].id;
    expect((await owner.del(`/api/brands/${id}`)).status).toBe(200);
    expect((await owner.get("/api/brands?q=som")).body.total).toBe(0);
  });
});
