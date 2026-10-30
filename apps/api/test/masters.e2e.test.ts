import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { gstinChecksum } from "@gc/shared";
import { createTestApp, loginAs, TestCtx } from "./helpers";

const validGstin = (state: string, pan: string) => `${state}${pan}1Z` + gstinChecksum(`${state}${pan}1Z`);

describe("masters: products, prices, parties, roles", () => {
  let t: TestCtx;
  let owner: Awaited<ReturnType<typeof loginAs>>;
  let brandId: string;
  let tileCat: string;
  let sanCat: string;
  let tileId: string;

  beforeAll(async () => {
    t = await createTestApp();
    owner = await loginAs(t.app);
    brandId = (await owner.post("/api/brands", { name: "Kajaria" })).body.id;
    tileCat = (await owner.post("/api/categories", { name: "Floor tiles", type: "TILE" })).body.id;
    sanCat = (await owner.post("/api/categories", { name: "Sanitaryware", type: "SANITARY" })).body.id;
  });
  afterAll(async () => {
    await t.app.close();
  });

  it("rejects a tile without pieces/sq ft per box", async () => {
    const res = await owner.post("/api/products", {
      sku: "TL-X", name: "Bad tile", brandId, categoryId: tileCat, hsn: "6907", gstRate: 18, uomType: "PIECE_BOX_AREA", mrpPaise: 100000,
    });
    expect(res.status).toBe(400);
    expect(res.body.issues.map((i: any) => i.path)).toEqual(expect.arrayContaining(["pcsPerBox", "sqftPerBox"]));
  });

  it("creates a tile and a sanitary product", async () => {
    const tile = await owner.post("/api/products", {
      sku: "tl-kj-6012-cal", name: "Calacatta Gold", brandId, categoryId: tileCat, hsn: "6907", gstRate: 18,
      uomType: "PIECE_BOX_AREA", pcsPerBox: 2, sqftPerBox: 15.5, mrpPaise: 248000, images: ["/api/files/products/a.jpg"],
    });
    expect(tile.status).toBe(201);
    expect(tile.body.sku).toBe("TL-KJ-6012-CAL");
    expect(tile.body.sqmPerBox).toBeCloseTo(1.44, 2);
    expect(tile.body.brand.name).toBe("Kajaria");
    tileId = tile.body.id;
    const wc = await owner.post("/api/products", {
      sku: "SN-WC-1", name: "One-piece WC", brandId, categoryId: sanCat, hsn: "6910", gstRate: 18, uomType: "UNIT", unitName: "nos", mrpPaise: 1850000,
    });
    expect(wc.status).toBe(201);
    expect(wc.body.pcsPerBox).toBeNull();
    const list = await owner.get("/api/products?q=calacatta");
    expect(list.body.total).toBe(1);
    const audit = await t.prisma.auditLog.count({ where: { entity: "product", entityId: tileId } });
    expect(audit).toBe(1);
  });

  it("denies product create to the sales counter role", async () => {
    const sales = await loginAs(t.app, "sales@kailashceramics.com");
    const res = await sales.post("/api/products", { sku: "Z", name: "Z", brandId, categoryId: sanCat, hsn: "6910", gstRate: 18, uomType: "UNIT" });
    expect(res.status).toBe(403);
    expect((await sales.get("/api/products")).status).toBe(200);
  });

  it("validates GSTIN checksum and state code on parties", async () => {
    const bad = await owner.post("/api/parties", { type: "CUSTOMER", name: "Bad GST", gstin: "33AAKFS1234M1Z1", stateCode: "33" });
    const good = validGstin("33", "AAKFS1234M");
    if (bad.status === 201) expect(good.endsWith("1")).toBe(true); // extremely unlikely collision
    else expect(bad.status).toBe(400);
    const wrongState = await owner.post("/api/parties", { type: "CUSTOMER", name: "Wrong state", gstin: good, stateCode: "32" });
    expect(wrongState.status).toBe(400);
    const ok = await owner.post("/api/parties", { type: "CUSTOMER", segment: "BUILDER", name: "Sri Murugan Constructions", gstin: good, stateCode: "33", creditLimitPaise: 150000000, creditDays: 30 });
    expect(ok.status).toBe(201);
    const site = await owner.post(`/api/parties/${ok.body.id}/sites`, { name: "Saravanampatti Villas" });
    expect(site.status).toBe(201);
    const one = await owner.get(`/api/parties/${ok.body.id}`);
    expect(one.body.sites).toHaveLength(1);
    const supplier = await owner.post("/api/parties", { type: "BOTH", name: "Kovai Agencies", stateCode: "33" });
    expect(supplier.status).toBe(201);
    const customers = await owner.get("/api/parties?type=CUSTOMER");
    expect(customers.body.items.map((p: any) => p.name)).toEqual(expect.arrayContaining(["Sri Murugan Constructions", "Kovai Agencies"]));
  });

  it("looks up segment price and falls back to MRP", async () => {
    const party = (await owner.get("/api/parties?q=murugan")).body.items[0];
    const fallback = await owner.get(`/api/prices/lookup?productId=${tileId}&partyId=${party.id}`);
    expect(fallback.body.source).toBe("MRP");
    expect(fallback.body.ratePerPiecePaise).toBe(124000); // 2480 per box / 2 pcs
    const pl = await owner.post("/api/price-lists", { name: "Builder", segment: "BUILDER" });
    const up = await owner.post(`/api/price-lists/${pl.body.id}/items`, { items: [{ productId: tileId, priceBasis: "PER_SQFT", pricePaise: 8000 }] });
    expect(up.status).toBe(201);
    const priced = await owner.get(`/api/prices/lookup?productId=${tileId}&partyId=${party.id}`);
    expect(priced.body.source).toBe("PRICE_LIST");
    expect(priced.body.ratePerPiecePaise).toBe(62000); // ₹80/sqft × 15.5 / 2
  });

  it("updates role permissions and discount limit", async () => {
    const roles = await owner.get("/api/roles");
    const sales = roles.body.items.find((r: any) => r.code === "SALES");
    const res = await owner.put(`/api/roles/${sales.id}/permissions`, { codes: [...sales.permissions, "catalogue.write"] });
    expect(res.status).toBe(200);
    expect(res.body.permissions).toContain("catalogue.write");
    const lim = await owner.patch(`/api/roles/${sales.id}`, { discountLimitPct: 7 });
    expect(lim.body.discountLimitPct).toBe(7);
    const salesUser = await loginAs(t.app, "sales@kailashceramics.com");
    const now = await salesUser.post("/api/brands", { name: "Somany" });
    expect(now.status).toBe(201);
    const bad = await owner.put(`/api/roles/${sales.id}/permissions`, { codes: ["nope.code"] });
    expect(bad.status).toBe(400);
  });

  it("imports products with a validation preview", async () => {
    const rows = [
      { sku: "TL-SM-3060-WD", name: "Wood Strip Matt", brand: "Somany", category_type: "TILE", series: "Woodland", size_mm: "300x600", finish: "Matt", color: "Brown", hsn: "6907", gst_rate: "18", uom_type: "PIECE_BOX_AREA", pcs_per_box: "8", sqft_per_box: "15.50", mrp_per_box: "1150", allow_loose_sale: "true" },
      { sku: "BAD-1", name: "Broken", brand: "Somany", category_type: "TILE", hsn: "6907", gst_rate: "18", uom_type: "PIECE_BOX_AREA" },
    ];
    const prev = await owner.post("/api/import/products/preview", { rows });
    expect(prev.body.errorCount).toBe(1);
    expect(prev.body.createCount).toBe(1);
    const blocked = await owner.post("/api/import/products/commit", { rows });
    expect(blocked.body.committed).toBe(false);
    const ok = await owner.post("/api/import/products/commit", { rows: [rows[0]] });
    expect(ok.body.committed).toBe(true);
    const p = await t.prisma.product.findUnique({ where: { sku: "TL-SM-3060-WD" }, include: { size: true } });
    expect(p?.size?.name).toBe("300x600");
    expect(Number(p?.mrpPaise)).toBe(115000);
  });

  it("creates users with branch access and blocks deactivated logins", async () => {
    const roles = (await owner.get("/api/roles")).body.items;
    const role = roles.find((r: any) => r.code === "SALES");
    const u = await owner.post("/api/users", { email: "new@kailashceramics.com", name: "New Staff", roleId: role.id, branchIds: [t.base.branch.id], password: "Welcome@123" });
    expect(u.status).toBe(201);
    expect(u.body.branches).toHaveLength(1);
    const off = await owner.patch(`/api/users/${u.body.id}`, { isActive: false });
    expect(off.status).toBe(200);
    const login = await owner.agent.post("/api/auth/login").send({ email: "new@kailashceramics.com", password: "Welcome@123" });
    expect(login.status).toBe(401);
  });
});
