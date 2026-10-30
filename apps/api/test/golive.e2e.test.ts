import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, loginAs, TestCtx } from "./helpers";

describe("go-live imports and checklist", () => {
  let t: TestCtx;
  let owner: Awaited<ReturnType<typeof loginAs>>;
  let tile: { id: string; sku: string };
  let wc: { id: string; sku: string };
  let customerId: string;

  beforeAll(async () => {
    t = await createTestApp();
    owner = await loginAs(t.app);
    const brand = await t.prisma.brand.create({ data: { name: "GL Brand" } });
    const tiles = await t.prisma.category.create({ data: { name: "GL Tiles", type: "TILE" } });
    const sanitary = await t.prisma.category.create({ data: { name: "GL Sanitary", type: "SANITARY" } });
    tile = await t.prisma.product.create({
      data: { sku: "GL-TILE-6060", name: "Golive tile", brandId: brand.id, categoryId: tiles.id, hsn: "6907", gstRate: 18, uomType: "PIECE_BOX_AREA", pcsPerBox: 4, sqftPerBox: 15.5, mrpPaise: 100000n },
    });
    wc = await t.prisma.product.create({
      data: { sku: "GL-WC-1", name: "Golive WC", brandId: brand.id, categoryId: sanitary.id, hsn: "6910", gstRate: 18, uomType: "UNIT", mrpPaise: 1500000n },
    });
    const party = await t.prisma.party.create({ data: { type: "CUSTOMER", segment: "BUILDER", name: "Opening Builders", stateCode: "33", creditDays: 30 } });
    customerId = party.id;
  });
  afterAll(async () => {
    await t.app.close();
  });

  const stockRows = () => [
    { sku: "GL-TILE-6060", godown_code: "MAIN", rack_code: "A1", batch_no: "OB-1", shade_code: "S1", caliber: "C1", grade: "PREMIUM", boxes: "10", loose_pcs: "2", landed_cost_per_box: "800" },
    { sku: "GL-WC-1", godown_code: "SHOW", rack_code: "", batch_no: "", shade_code: "", caliber: "", grade: "", boxes: "3", loose_pcs: "0", landed_cost_per_box: "" },
  ];

  it("previews opening stock with per-row errors", async () => {
    const res = await owner.post("/api/import/opening-stock/preview", {
      rows: [...stockRows(), { sku: "NOPE", godown_code: "MAIN", boxes: "1" }, { sku: "GL-TILE-6060", godown_code: "MAIN", boxes: "2", batch_no: "", shade_code: "", caliber: "" }],
    });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(4);
    expect(res.body.errorCount).toBe(2);
    expect(res.body.results[2].errors[0]).toMatch(/not found/);
    expect(res.body.results[3].errors.join(" ")).toMatch(/batch_no is required/);
    expect(res.body.results[0].notes.join(" ")).toMatch(/10 box \+ 2 pcs/);
  });

  it("refuses to commit while any row has errors", async () => {
    const res = await owner.post("/api/import/opening-stock/commit", { rows: [...stockRows(), { sku: "NOPE", godown_code: "MAIN", boxes: "1" }] });
    expect(res.body.committed).toBe(false);
    expect(await t.prisma.stockLedger.count({ where: { refType: "OPENING_STOCK" } })).toBe(0);
  });

  it("commits opening stock through the ledger and refuses a second import", async () => {
    const res = await owner.post("/api/import/opening-stock/commit", { rows: stockRows() });
    expect(res.body.committed).toBe(true);
    const batch = await t.prisma.batch.findUniqueOrThrow({ where: { productId_batchNo: { productId: tile.id, batchNo: "OB-1" } } });
    expect(batch.shadeCode).toBe("S1");
    expect(batch.grade).toBe("PREMIUM");
    expect(Number(batch.landedCostPaise)).toBe(20000); // ₹800 per box of 4
    const tileBal = await t.prisma.stockBalance.aggregate({ where: { productId: tile.id, stockType: "SALEABLE" }, _sum: { qtyPcs: true } });
    expect(tileBal._sum.qtyPcs).toBe(42);
    const wcBal = await t.prisma.stockBalance.aggregate({ where: { productId: wc.id, stockType: "SALEABLE" }, _sum: { qtyPcs: true } });
    expect(wcBal._sum.qtyPcs).toBe(3);
    const ledgerRows = await t.prisma.stockLedger.count({ where: { refType: "OPENING_STOCK" } });
    expect(ledgerRows).toBe(2);

    const again = await owner.post("/api/import/opening-stock/preview", { rows: stockRows() });
    expect(again.body.errorCount).toBe(2);
    expect(again.body.results[0].errors[0]).toMatch(/already imported/);
  });

  it("imports opening outstanding bills that receipts can settle by bill", async () => {
    const rows = [
      { party_name: "opening builders", bill_no: "TALLY/25-26/118", bill_date: "15/03/2026", amount: "1,18,000", due_date: "" },
      { party_name: "Opening Builders", bill_no: "TALLY/26-27/007", bill_date: "2026-05-10", amount: "50000.50", due_date: "2026-06-30" },
    ];
    const preview = await owner.post("/api/import/opening-outstanding/preview", { rows: [...rows, { party_name: "Nobody", bill_no: "X1", bill_date: "bad", amount: "0" }] });
    expect(preview.body.errorCount).toBe(1);
    expect(preview.body.results[2].errors.length).toBeGreaterThanOrEqual(3);

    const res = await owner.post("/api/import/opening-outstanding/commit", { rows });
    expect(res.body.committed).toBe(true);
    const bills = await t.prisma.invoice.findMany({ where: { partyId: customerId }, orderBy: { date: "asc" } });
    expect(bills.map((b) => b.number)).toEqual(["TALLY/25-26/118", "TALLY/26-27/007"]);
    expect(bills[0].status).toBe("POSTED");
    expect(bills[0].syncStatus).toBe("SYNCED");
    expect(Number(bills[0].totalPaise)).toBe(11800000);
    expect(Number(bills[1].totalPaise)).toBe(5000050);
    expect(await t.prisma.tallySyncQueue.count({ where: { entityType: "INVOICE" } })).toBe(0);

    const dup = await owner.post("/api/import/opening-outstanding/preview", { rows: [rows[0]] });
    expect(dup.body.results[0].errors[0]).toMatch(/already exists/);

    const receipt = await owner.post("/api/receipts", { partyId: customerId, mode: "NEFT", amountPaise: 12000000, reference: "UTR123", allocationMode: "AUTO" });
    expect(receipt.status).toBe(201);
    const after = await t.prisma.invoice.findMany({ where: { partyId: customerId }, orderBy: { date: "asc" } });
    expect(Number(after[0].paidPaise)).toBe(11800000);
    expect(Number(after[1].paidPaise)).toBe(200000);
  });

  it("returns the go-live checklist", async () => {
    const res = await owner.get("/api/golive/checklist");
    expect(res.status).toBe(200);
    const byKey = Object.fromEntries(res.body.checks.map((c: { key: string; status: string }) => [c.key, c.status]));
    expect(byKey["opening-stock"]).toBe("pass");
    expect(byKey["opening-outstanding"]).toBe("pass");
    expect(byKey["tally-agent"]).toBe("fail");
    expect(byKey["demo-users"]).toBe("warn");
    expect(res.body.summary.fail).toBeGreaterThan(0);
  });

  it("checks permissions", async () => {
    const sales = await loginAs(t.app, "sales@kailashceramics.com");
    expect((await sales.post("/api/import/opening-stock/preview", { rows: stockRows() })).status).toBe(403);
    expect((await sales.post("/api/import/opening-outstanding/commit", { rows: [{ party_name: "x" }] })).status).toBe(403);
  });
});
