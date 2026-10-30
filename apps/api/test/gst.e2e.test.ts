import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, loginAs, TestCtx } from "./helpers";

describe("gst: e-invoice and e-way bill", () => {
  let t: TestCtx;
  let owner: Awaited<ReturnType<typeof loginAs>>;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTestApp();
    owner = await loginAs(t.app);
    const p = t.prisma;
    const brand = await p.brand.create({ data: { name: "Kajaria" } });
    const cat = await p.category.create({ data: { name: "Floor tiles", type: "TILE" } });
    const tile = await p.product.create({
      data: { sku: "TL-1", name: "Calacatta Gold", brandId: brand.id, categoryId: cat.id, hsn: "6907", gstRate: 18, uomType: "PIECE_BOX_AREA", pcsPerBox: 2, sqftPerBox: 15.5 },
    });
    const b2b = await p.party.create({ data: { type: "CUSTOMER", name: "Sri Murugan Constructions", gstin: "33AAKFS1234M1Z4", stateCode: "33", billingAddress: "Gandhipuram 641012" } });
    const b2c = await p.party.create({ data: { type: "CUSTOMER", name: "Walk-in", stateCode: "33" } });
    const mk = (partyId: string, number: string | null, status: "POSTED" | "DRAFT") =>
      p.invoice.create({
        data: {
          branchId: t.base.branch.id,
          number,
          date: new Date(),
          partyId,
          placeOfSupply: "33",
          status,
          taxablePaise: 63939n,
          cgstPaise: 5755n,
          sgstPaise: 5755n,
          roundOffPaise: -49n,
          totalPaise: 75400n,
          lines: {
            create: [{ productId: tile.id, hsn: "6907", qtyPcs: 3, ratePaise: 21313n, gstRate: 18, taxablePaise: 63939n, cgstPaise: 5755n, sgstPaise: 5755n, amountPaise: 75449n }],
          },
        },
      });
    ids.b2b = (await mk(b2b.id, "KC/CBE/26-27/0001", "POSTED")).id;
    ids.b2c = (await mk(b2c.id, "KC/CBE/26-27/0002", "POSTED")).id;
    ids.draft = (await mk(b2b.id, null, "DRAFT")).id;
  });

  afterAll(async () => {
    delete process.env.GSP_PROVIDER;
    await t.app.close();
  });

  it("previews the NIC payload", async () => {
    const res = await owner.get(`/api/gst/einvoice/${ids.b2b}/payload`);
    expect(res.status).toBe(200);
    expect(res.body.applicable).toBe(true);
    expect(res.body.payload.DocDtls.No).toBe("KC/CBE/26-27/0001");
    expect(res.body.payload.ValDtls.TotInvVal).toBe(754);
  });

  it("refuses without a GSP, for B2C and for drafts", async () => {
    delete process.env.GSP_PROVIDER;
    const noGsp = await owner.post(`/api/gst/einvoice/${ids.b2b}/generate`, {});
    expect(noGsp.status).toBe(400);
    expect(noGsp.body.message).toMatch(/GSP is not configured/);
    process.env.GSP_PROVIDER = "mock";
    expect((await owner.post(`/api/gst/einvoice/${ids.b2c}/generate`, {})).status).toBe(400);
    expect((await owner.post(`/api/gst/einvoice/${ids.draft}/generate`, {})).status).toBe(400);
  });

  it("generates the IRN once (mock GSP) and an e-way bill", async () => {
    process.env.GSP_PROVIDER = "mock";
    const first = await owner.post(`/api/gst/einvoice/${ids.b2b}/generate`, {});
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(first.body.irn).toMatch(/^[0-9a-f]{64}$/);
    const again = await owner.post(`/api/gst/einvoice/${ids.b2b}/generate`, {});
    expect(again.body.irn).toBe(first.body.irn);
    const ewb = await owner.post(`/api/gst/ewaybill/${ids.b2b}`, { vehicleNo: "TN37AB1234", distanceKm: 12 });
    expect(ewb.status, JSON.stringify(ewb.body)).toBe(201);
    const inv = await t.prisma.invoice.findUniqueOrThrow({ where: { id: ids.b2b } });
    expect(inv.irn).toBe(first.body.irn);
    expect(inv.ewayBillNo).toBe(ewb.body.ewayBillNo);
    expect(await t.prisma.auditLog.count({ where: { entityId: ids.b2b, action: "irn_generated" } })).toBe(1);
  });
});
