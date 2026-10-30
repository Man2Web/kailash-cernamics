// NIC e-invoice JSON (schema v1.1) built from a posted ERP invoice. Amounts in rupees with 2 decimals
// as the IRP expects; quantities in the item's unit (tiles: pieces, UQC "PCS"; sanitary: "NOS").

export interface EInvoiceSource {
  number: string;
  date: Date;
  isInterState: boolean;
  placeOfSupply: string;
  taxablePaise: bigint;
  cgstPaise: bigint;
  sgstPaise: bigint;
  igstPaise: bigint;
  roundOffPaise: bigint;
  totalPaise: bigint;
  transportPaise: bigint;
  loadingPaise: bigint;
  branch: { gstin: string | null; name: string; address: string | null; city: string | null; stateCode: string };
  company: { legalName: string | null; name: string };
  party: { gstin: string | null; name: string; billingAddress: string | null; city: string | null; stateCode: string };
  lines: {
    qtyPcs: number;
    ratePaise: bigint;
    discountPct: number;
    gstRate: number;
    hsn: string;
    taxablePaise: bigint;
    cgstPaise: bigint;
    sgstPaise: bigint;
    igstPaise: bigint;
    amountPaise: bigint;
    product: { name: string; uomType: string };
  }[];
}

const r = (paise: bigint | number) => Math.round(Number(paise)) / 100;

function pin(address: string | null | undefined): number {
  const m = /\b(\d{6})\b/.exec(address ?? "");
  return m ? Number(m[1]) : 641001;
}

function ddmmyyyy(d: Date): string {
  const ist = new Date(d.getTime() + 330 * 60_000);
  return `${String(ist.getUTCDate()).padStart(2, "0")}/${String(ist.getUTCMonth() + 1).padStart(2, "0")}/${ist.getUTCFullYear()}`;
}

export function buildEInvoice(inv: EInvoiceSource) {
  const items = inv.lines.map((l, i) => {
    const gross = Number(l.ratePaise) * l.qtyPcs;
    const discount = gross - Number(l.taxablePaise);
    return {
      SlNo: String(i + 1),
      PrdDesc: l.product.name.slice(0, 300),
      IsServc: "N",
      HsnCd: l.hsn,
      Qty: l.qtyPcs,
      Unit: l.product.uomType === "PIECE_BOX_AREA" ? "PCS" : "NOS",
      UnitPrice: r(l.ratePaise),
      TotAmt: r(gross),
      Discount: r(discount),
      AssAmt: r(l.taxablePaise),
      GstRt: l.gstRate,
      IgstAmt: r(l.igstPaise),
      CgstAmt: r(l.cgstPaise),
      SgstAmt: r(l.sgstPaise),
      TotItemVal: r(l.amountPaise),
    };
  });
  const charges = Number(inv.transportPaise + inv.loadingPaise);
  return {
    Version: "1.1",
    TranDtls: { TaxSch: "GST", SupTyp: "B2B", RegRev: "N", IgstOnIntra: "N" },
    DocDtls: { Typ: "INV", No: inv.number, Dt: ddmmyyyy(inv.date) },
    SellerDtls: {
      Gstin: inv.branch.gstin,
      LglNm: inv.company.legalName || inv.company.name,
      TrdNm: inv.branch.name,
      Addr1: (inv.branch.address || inv.branch.city || "").slice(0, 100) || "NA",
      Loc: inv.branch.city || "NA",
      Pin: pin(inv.branch.address),
      Stcd: inv.branch.stateCode,
    },
    BuyerDtls: {
      Gstin: inv.party.gstin,
      LglNm: inv.party.name,
      Pos: inv.placeOfSupply,
      Addr1: (inv.party.billingAddress || inv.party.city || "").slice(0, 100) || "NA",
      Loc: inv.party.city || "NA",
      Pin: pin(inv.party.billingAddress),
      Stcd: inv.party.stateCode,
    },
    ItemList: items,
    ValDtls: {
      AssVal: r(inv.taxablePaise),
      CgstVal: r(inv.cgstPaise),
      SgstVal: r(inv.sgstPaise),
      IgstVal: r(inv.igstPaise),
      OthChrg: r(charges),
      RndOffAmt: r(inv.roundOffPaise),
      TotInvVal: r(inv.totalPaise),
    },
  };
}

/** E-invoice applies to B2B supplies (buyer has a GSTIN) once the seller crosses the AATO threshold. */
export function einvoiceApplicable(inv: { party: { gstin: string | null } }): boolean {
  return !!inv.party.gstin;
}
