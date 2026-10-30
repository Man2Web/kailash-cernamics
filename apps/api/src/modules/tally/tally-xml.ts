// TallyPrime XML envelopes (docs/specs/tally.md). Verify tags against the current TallyPrime XML
// reference on a COPY of the client's company before go-live.
//
// Sign convention in Tally vouchers: debit entries carry ISDEEMEDPOSITIVE=Yes and a negative
// AMOUNT; credit entries ISDEEMEDPOSITIVE=No and a positive AMOUNT.

export function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** paise → "1234.50" */
export function amt(paise: number | bigint): string {
  const p = Number(paise);
  const sign = p < 0 ? "-" : "";
  const abs = Math.abs(p);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Date → yyyymmdd in IST. */
export function tallyDate(d: Date): string {
  const ist = new Date(d.getTime() + 330 * 60_000);
  return `${ist.getUTCFullYear()}${String(ist.getUTCMonth() + 1).padStart(2, "0")}${String(ist.getUTCDate()).padStart(2, "0")}`;
}

export function envelope(company: string, reportName: "All Masters" | "Vouchers", body: string): string {
  return `<ENVELOPE>
  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>${reportName}</REPORTNAME>
        <STATICVARIABLES><SVCURRENTCOMPANY>${esc(company)}</SVCURRENTCOMPANY></STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
${body}
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

export interface LedgerXmlInput {
  remoteId: string;
  name: string;
  parent: "Sundry Debtors" | "Sundry Creditors";
  gstin?: string | null;
  stateName?: string | null;
  address?: string | null;
  phone?: string | null;
  exists: boolean;
}

export function ledgerXml(l: LedgerXmlInput): string {
  return `          <LEDGER NAME="${esc(l.name)}" REMOTEID="${esc(l.remoteId)}" ACTION="${l.exists ? "Alter" : "Create"}">
            <NAME.LIST><NAME>${esc(l.name)}</NAME></NAME.LIST>
            <PARENT>${l.parent}</PARENT>
            <ISBILLWISEON>Yes</ISBILLWISEON>
            ${l.gstin ? `<PARTYGSTIN>${esc(l.gstin)}</PARTYGSTIN><GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE>` : "<GSTREGISTRATIONTYPE>Unregistered</GSTREGISTRATIONTYPE>"}
            ${l.stateName ? `<LEDSTATENAME>${esc(l.stateName)}</LEDSTATENAME>` : ""}
            ${l.address ? `<ADDRESS.LIST><ADDRESS>${esc(l.address)}</ADDRESS></ADDRESS.LIST>` : ""}
            ${l.phone ? `<LEDGERPHONE>${esc(l.phone)}</LEDGERPHONE>` : ""}
          </LEDGER>`;
}

export interface StockItemXmlInput {
  remoteId: string;
  name: string;
  hsn: string;
  gstRate: number;
  pcsPerBox?: number | null;
  baseUnit: string;
  exists: boolean;
}

/** Stock item in pieces with Box as the alternate unit (tiles); simple units for sanitary. */
export function stockItemXml(s: StockItemXmlInput): string {
  const alt = s.pcsPerBox
    ? `<ADDITIONALUNITS>Box</ADDITIONALUNITS><DENOMINATOR>1</DENOMINATOR><CONVERSION>${s.pcsPerBox}</CONVERSION>`
    : "";
  return `          <UNIT NAME="${esc(s.baseUnit)}" ACTION="Create"><NAME>${esc(s.baseUnit)}</NAME><ISSIMPLEUNIT>Yes</ISSIMPLEUNIT></UNIT>
          ${s.pcsPerBox ? `<UNIT NAME="Box" ACTION="Create"><NAME>Box</NAME><ISSIMPLEUNIT>Yes</ISSIMPLEUNIT></UNIT>` : ""}
          <STOCKITEM NAME="${esc(s.name)}" REMOTEID="${esc(s.remoteId)}" ACTION="${s.exists ? "Alter" : "Create"}">
            <NAME.LIST><NAME>${esc(s.name)}</NAME></NAME.LIST>
            <BASEUNITS>${esc(s.baseUnit)}</BASEUNITS>
            ${alt}
            <GSTAPPLICABLE>Applicable</GSTAPPLICABLE>
            <GSTDETAILS.LIST>
              <APPLICABLEFROM>20170701</APPLICABLEFROM>
              <HSNCODE>${esc(s.hsn)}</HSNCODE>
              <TAXABILITY>Taxable</TAXABILITY>
              <STATEWISEDETAILS.LIST>
                <STATENAME>&#4; Any</STATENAME>
                <RATEDETAILS.LIST><GSTRATEDUTYHEAD>Integrated Tax</GSTRATEDUTYHEAD><GSTRATE>${s.gstRate}</GSTRATE></RATEDETAILS.LIST>
                <RATEDETAILS.LIST><GSTRATEDUTYHEAD>Central Tax</GSTRATEDUTYHEAD><GSTRATE>${s.gstRate / 2}</GSTRATE></RATEDETAILS.LIST>
                <RATEDETAILS.LIST><GSTRATEDUTYHEAD>State Tax</GSTRATEDUTYHEAD><GSTRATE>${s.gstRate / 2}</GSTRATE></RATEDETAILS.LIST>
              </STATEWISEDETAILS.LIST>
            </GSTDETAILS.LIST>
          </STOCKITEM>`;
}

export interface InventoryLine {
  stockItem: string;
  qty: number;
  unit: string;
  ratePaise: number;
  amountPaise: number;
  godown?: string | null;
  batch?: string | null;
  ledger: string;
}

export interface LedgerLine {
  ledger: string;
  /** positive = debit, negative = credit (ERP view) */
  debitPaise: number;
  billRefs?: { name: string; type: "New Ref" | "Agst Ref" | "On Account"; amountPaise: number }[];
  isParty?: boolean;
}

export interface VoucherXmlInput {
  remoteId: string;
  vchType: "Sales" | "Purchase" | "Credit Note" | "Debit Note" | "Receipt" | "Payment";
  date: Date;
  number: string;
  partyLedger: string;
  narration?: string | null;
  inventory?: InventoryLine[];
  /** inventory entries are credit for Sales/Debit Note, debit for Purchase/Credit Note */
  inventoryIsDebit?: boolean;
  ledgers: LedgerLine[];
  reference?: string | null;
}

export function voucherXml(v: VoucherXmlInput): string {
  const invView = v.inventory?.length ? 'OBJVIEW="Invoice Voucher View"' : 'OBJVIEW="Accounting Voucher View"';
  const inv = (v.inventory ?? [])
    .map((l) => {
      const sign = v.inventoryIsDebit ? -1 : 1;
      return `            <ALLINVENTORYENTRIES.LIST>
              <STOCKITEMNAME>${esc(l.stockItem)}</STOCKITEMNAME>
              <ISDEEMEDPOSITIVE>${v.inventoryIsDebit ? "Yes" : "No"}</ISDEEMEDPOSITIVE>
              <RATE>${amt(l.ratePaise)}/${esc(l.unit)}</RATE>
              <AMOUNT>${amt(sign * l.amountPaise)}</AMOUNT>
              <ACTUALQTY> ${l.qty} ${esc(l.unit)}</ACTUALQTY>
              <BILLEDQTY> ${l.qty} ${esc(l.unit)}</BILLEDQTY>
              <BATCHALLOCATIONS.LIST>
                <GODOWNNAME>${esc(l.godown || "Main Location")}</GODOWNNAME>
                <BATCHNAME>${esc(l.batch || "Primary Batch")}</BATCHNAME>
                <AMOUNT>${amt(sign * l.amountPaise)}</AMOUNT>
                <ACTUALQTY> ${l.qty} ${esc(l.unit)}</ACTUALQTY>
                <BILLEDQTY> ${l.qty} ${esc(l.unit)}</BILLEDQTY>
              </BATCHALLOCATIONS.LIST>
              <ACCOUNTINGALLOCATIONS.LIST>
                <LEDGERNAME>${esc(l.ledger)}</LEDGERNAME>
                <ISDEEMEDPOSITIVE>${v.inventoryIsDebit ? "Yes" : "No"}</ISDEEMEDPOSITIVE>
                <AMOUNT>${amt(sign * l.amountPaise)}</AMOUNT>
              </ACCOUNTINGALLOCATIONS.LIST>
            </ALLINVENTORYENTRIES.LIST>`;
    })
    .join("\n");
  const leds = v.ledgers
    .filter((l) => l.debitPaise !== 0)
    .map((l) => {
      const debit = l.debitPaise > 0;
      const bills = (l.billRefs ?? [])
        .map(
          (b) => `              <BILLALLOCATIONS.LIST>
                <NAME>${esc(b.name)}</NAME>
                <BILLTYPE>${b.type}</BILLTYPE>
                <AMOUNT>${amt(debit ? -Math.abs(b.amountPaise) : Math.abs(b.amountPaise))}</AMOUNT>
              </BILLALLOCATIONS.LIST>`,
        )
        .join("\n");
      return `            <LEDGERENTRIES.LIST>
              <LEDGERNAME>${esc(l.ledger)}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>${debit ? "Yes" : "No"}</ISDEEMEDPOSITIVE>
              <ISPARTYLEDGER>${l.isParty ? "Yes" : "No"}</ISPARTYLEDGER>
              <AMOUNT>${amt(-l.debitPaise)}</AMOUNT>
${bills}
            </LEDGERENTRIES.LIST>`;
    })
    .join("\n");
  return `          <VOUCHER REMOTEID="${esc(v.remoteId)}" VCHTYPE="${v.vchType}" ACTION="Create" ${invView}>
            <DATE>${tallyDate(v.date)}</DATE>
            <VOUCHERTYPENAME>${v.vchType}</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${esc(v.number)}</VOUCHERNUMBER>
            <PARTYLEDGERNAME>${esc(v.partyLedger)}</PARTYLEDGERNAME>
            ${v.reference ? `<REFERENCE>${esc(v.reference)}</REFERENCE>` : ""}
            <ISINVOICE>${v.inventory?.length ? "Yes" : "No"}</ISINVOICE>
            ${v.narration ? `<NARRATION>${esc(v.narration)}</NARRATION>` : ""}
${inv}
${leds}
          </VOUCHER>`;
}

/** Cancel (never delete) the voucher created earlier with the same REMOTEID. */
export function cancelVoucherXml(c: { remoteId: string; vchType: string; date: Date; number: string; narration?: string }): string {
  return `          <VOUCHER REMOTEID="${esc(c.remoteId)}" DATE="${tallyDate(c.date)}" TAGNAME="Voucher Number" TAGVALUE="${esc(c.number)}" VCHTYPE="${esc(c.vchType)}" ACTION="Cancel">
            <NARRATION>${esc(c.narration ?? "Cancelled in ERP")}</NARRATION>
          </VOUCHER>`;
}

/** Parse a TallyPrime import response. */
export function parseImportResponse(xml: string): { created: number; altered: number; errors: number; lineError: string | null; guid: string | null } {
  const num = (tag: string) => Number(new RegExp(`<${tag}>(\\d+)</${tag}>`).exec(xml)?.[1] ?? 0);
  const lineError = /<LINEERROR>([\s\S]*?)<\/LINEERROR>/.exec(xml)?.[1]?.trim() ?? null;
  const guid = /<LASTVCHID>([^<]+)<\/LASTVCHID>/.exec(xml)?.[1] ?? /<GUID>([^<]+)<\/GUID>/.exec(xml)?.[1] ?? null;
  return { created: num("CREATED"), altered: num("ALTERED"), errors: num("ERRORS"), lineError, guid };
}
