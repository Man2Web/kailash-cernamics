import { describe, expect, it } from "vitest";
import { buildEInvoice, einvoiceApplicable } from "./einvoice.builder";

const base = {
  number: "KC/CBE/26-27/0007",
  date: new Date("2026-10-24T05:00:00Z"),
  isInterState: false,
  placeOfSupply: "33",
  taxablePaise: 63939n,
  cgstPaise: 5755n,
  sgstPaise: 5755n,
  igstPaise: 0n,
  roundOffPaise: -49n,
  totalPaise: 75400n,
  transportPaise: 0n,
  loadingPaise: 0n,
  branch: { gstin: "33AABCG1234F1Z5", name: "Main", address: "Avinashi Road, Coimbatore 641018", city: "Coimbatore", stateCode: "33" },
  company: { legalName: "Kailash Ceramics", name: "Kailash Ceramics" },
  party: { gstin: "33AAACS1234B1Z2", name: "Sri Murugan Constructions", billingAddress: "Gandhipuram 641012", city: "Coimbatore", stateCode: "33" },
  lines: [
    {
      qtyPcs: 3,
      ratePaise: 21313n,
      discountPct: 0,
      gstRate: 18,
      hsn: "6907",
      taxablePaise: 63939n,
      cgstPaise: 5755n,
      sgstPaise: 5755n,
      igstPaise: 0n,
      amountPaise: 75449n,
      product: { name: "Calacatta Gold Glossy 600x1200", uomType: "PIECE_BOX_AREA" },
    },
  ],
};

describe("e-invoice payload", () => {
  it("maps an invoice to NIC schema 1.1 with rupee values", () => {
    const p = buildEInvoice(base);
    expect(p.Version).toBe("1.1");
    expect(p.DocDtls).toEqual({ Typ: "INV", No: "KC/CBE/26-27/0007", Dt: "24/10/2026" });
    expect(p.SellerDtls.Pin).toBe(641018);
    expect(p.BuyerDtls.Pos).toBe("33");
    expect(p.ItemList[0]).toMatchObject({ HsnCd: "6907", Qty: 3, Unit: "PCS", UnitPrice: 213.13, AssAmt: 639.39, CgstAmt: 57.55, SgstAmt: 57.55 });
    expect(p.ValDtls).toMatchObject({ AssVal: 639.39, CgstVal: 57.55, RndOffAmt: -0.49, TotInvVal: 754 });
  });

  it("applies only to B2B", () => {
    expect(einvoiceApplicable(base)).toBe(true);
    expect(einvoiceApplicable({ party: { gstin: null } })).toBe(false);
  });
});
