import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, loginAs, TestCtx } from "./helpers";

describe("crm: leads, follow-ups, visits, conversion, dashboard, reports", () => {
  let t: TestCtx;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.app.close();
  });

  it("creates a lead with a follow-up due today and completes it", async () => {
    const sales = await loginAs(t.app, "sales@kailashceramics.com");
    const res = await sales.post("/api/leads", { name: "Mr. Ramesh", phone: "9840012345", source: "WALK_IN", requirement: "Living room 600x1200 + 2 bathrooms", nextFollowupAt: new Date().toISOString() });
    expect(res.status).toBe(201);
    const today = await sales.get("/api/followups?when=today");
    expect(today.body.total).toBe(1);
    const done = await sales.post(`/api/followups/${today.body.items[0].id}/done`, { outcome: "Visited showroom, liked Calacatta", nextDueAt: new Date(Date.now() + 3 * 86_400_000).toISOString() });
    expect(done.status).toBe(201);
    const lead = await sales.get(`/api/leads/${res.body.id}`);
    expect(lead.body.status).toBe("CONTACTED");
    expect(lead.body.followups).toHaveLength(2);
    const visit = await sales.post("/api/site-visits", { leadId: res.body.id, lat: 11.0168, lng: 76.9558, notes: "Measured rooms" });
    expect(visit.status).toBe(201);
  });

  it("converts a lead into a draft quotation once", async () => {
    const sales = await loginAs(t.app, "sales@kailashceramics.com");
    const lead = await sales.post("/api/leads", { name: "Kavya Interiors", phone: "9443300000", source: "ARCHITECT" });
    const conv = await sales.post(`/api/leads/${lead.body.id}/convert`);
    expect(conv.status).toBe(201);
    expect(conv.body.number).toMatch(/^QT\/CBE\//);
    const q = await t.prisma.quotation.findUniqueOrThrow({ where: { id: conv.body.quotationId } });
    expect(q.status).toBe("DRAFT");
    expect(q.customerName).toBe("Kavya Interiors");
    const again = await sales.post(`/api/leads/${lead.body.id}/convert`);
    expect(again.body.quotationId).toBe(conv.body.quotationId);
    expect((await sales.get(`/api/leads/${lead.body.id}`)).body.status).toBe("QUOTED");
  });

  it("dashboard hides stock value from roles without cost access; reports run", async () => {
    const owner = await loginAs(t.app);
    const d = await owner.get("/api/dashboard");
    expect(d.status).toBe(200);
    expect(typeof d.body.stockValuePaise).toBe("number");
    const sales = await loginAs(t.app, "sales@kailashceramics.com");
    expect((await sales.get("/api/dashboard")).body.stockValuePaise).toBeNull();
    for (const r of ["sales-by-brand", "outstanding-summary", "movers-by-shade", "influencer-performance"]) {
      const res = await owner.get(`/api/reports/${r}`);
      expect(res.status, r).toBe(200);
      expect(Array.isArray(res.body.columns)).toBe(true);
    }
    expect((await sales.get("/api/reports/margin-by-brand")).status).toBe(403);
  });
});
