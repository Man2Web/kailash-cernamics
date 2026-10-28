/**
 * XML Builder for TallyPrime Integration
 * Formats standard Tally XML requests with proper escaping and envelopes.
 */

export function escapeXml(str: any): string {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function formatTallyDate(dateVal?: string | Date | null): string {
  if (!dateVal) {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${yyyy}${mm}${dd}`;
  }
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return formatTallyDate(null);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

export function wrapTallyEnvelope(innerXml: string, companyName?: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>All Masters</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${escapeXml(companyName || "")}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        ${innerXml}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

export function buildLedgerXml(params: {
  name: string;
  parent: string; // e.g. 'Sundry Debtors', 'Sundry Creditors', 'Bank Accounts'
  gstin?: string | null;
  pan?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  state?: string | null;
  country?: string | null;
  pincode?: string | null;
  creditLimit?: number | null;
  openingBalance?: number | null;
  guid?: string | null;
}): string {
  const isDebtor = params.parent.toLowerCase().includes("debtor");
  const openingBalance = params.openingBalance || 0;
  // In Tally, positive is debit, negative is credit. Debtors are Debit, Creditors are Credit.
  const signedOpeningBalance = isDebtor ? openingBalance : -openingBalance;

  return `<TALLYMESSAGE xmlns:UDF="TallyUDF">
  <LEDGER NAME="${escapeXml(params.name)}" ACTION="Create">
    <NAME.LIST>
      <NAME>${escapeXml(params.name)}</NAME>
    </NAME.LIST>
    <PARENT>${escapeXml(params.parent)}</PARENT>
    <ISBILLWISEON>Yes</ISBILLWISEON>
    <AFFECTSSTOCK>No</AFFECTSSTOCK>
    ${params.gstin ? `<PARTYGSTIN>${escapeXml(params.gstin)}</PARTYGSTIN><GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE>` : `<GSTREGISTRATIONTYPE>Consumer</GSTREGISTRATIONTYPE>`}
    ${params.pan ? `<INCOMETAXNUMBER>${escapeXml(params.pan)}</INCOMETAXNUMBER>` : ""}
    ${params.email ? `<EMAIL>${escapeXml(params.email)}</EMAIL>` : ""}
    ${params.phone ? `<LEDGERPHONE>${escapeXml(params.phone)}</LEDGERPHONE>` : ""}
    ${params.state ? `<STATENAME>${escapeXml(params.state)}</STATENAME><LEDSTATENAME>${escapeXml(params.state)}</LEDSTATENAME>` : ""}
    <COUNTRYNAME>${escapeXml(params.country || "India")}</COUNTRYNAME>
    ${params.pincode ? `<PINCODE>${escapeXml(params.pincode)}</PINCODE>` : ""}
    ${
      params.address
        ? `<ADDRESS.LIST>
        ${params.address
          .split("\n")
          .map((line) => `<ADDRESS>${escapeXml(line.trim())}</ADDRESS>`)
          .join("\n        ")}
      </ADDRESS.LIST>`
        : ""
    }
    ${params.creditLimit ? `<CREDITLIMIT>${params.creditLimit}</CREDITLIMIT>` : ""}
    ${openingBalance !== 0 ? `<OPENINGBALANCE>${signedOpeningBalance}</OPENINGBALANCE>` : ""}
    ${params.guid ? `<GUID>${escapeXml(params.guid)}</GUID>` : ""}
  </LEDGER>
</TALLYMESSAGE>`;
}

export function buildStockItemXml(params: {
  name: string;
  unit: string;
  hsnCode?: string | null;
  gstRate?: number | null;
  sellingPrice?: number | null;
  purchasePrice?: number | null;
  description?: string | null;
  openingQty?: number | null;
  openingRate?: number | null;
  guid?: string | null;
}): string {
  const openingQty = params.openingQty || 0;
  const openingRate = params.openingRate || 0;
  const openingValue = openingQty * openingRate;

  return `<TALLYMESSAGE xmlns:UDF="TallyUDF">
  <STOCKITEM NAME="${escapeXml(params.name)}" ACTION="Create">
    <NAME.LIST>
      <NAME>${escapeXml(params.name)}</NAME>
    </NAME.LIST>
    <BASEUNITS>${escapeXml(params.unit || "Nos")}</BASEUNITS>
    <GSTTYPEOFSUPPLY>Goods</GSTTYPEOFSUPPLY>
    <ISCOSTCENTRESON>No</ISCOSTCENTRESON>
    ${params.hsnCode ? `<HSNCODE>${escapeXml(params.hsnCode)}</HSNCODE>` : ""}
    ${
      params.gstRate !== undefined && params.gstRate !== null
        ? `<GSTRATEDETAILS.LIST>
        <GSTRATEDUTYHEAD>IGST</GSTRATEDUTYHEAD>
        <GSTRATEVALUATIONTYPE>Based on Value</GSTRATEVALUATIONTYPE>
        <GSTRATE>${params.gstRate}</GSTRATE>
      </GSTRATEDETAILS.LIST>`
        : ""
    }
    ${params.description ? `<DESCRIPTION>${escapeXml(params.description)}</DESCRIPTION>` : ""}
    ${
      openingQty > 0
        ? `<OPENINGBALANCE>${openingQty} ${escapeXml(params.unit || "Nos")}</OPENINGBALANCE>
      <OPENINGRATE>${openingRate}/${escapeXml(params.unit || "Nos")}</OPENINGRATE>
      <OPENINGVALUE>-${openingValue.toFixed(2)}</OPENINGVALUE>`
        : ""
    }
    ${params.guid ? `<GUID>${escapeXml(params.guid)}</GUID>` : ""}
  </STOCKITEM>
</TALLYMESSAGE>`;
}

export interface VoucherItemRow {
  stockItemName: string;
  unit: string;
  quantity: number;
  rate: number;
  amount: number;
  discount?: number;
  hsnCode?: string;
  gstRate?: number;
}

export interface VoucherLedgerEntry {
  ledgerName: string;
  amount: number; // positive = debit, negative = credit
  isPartyLedger?: boolean;
  isDeemedPositive?: boolean; // true for Debit, false for Credit
  narration?: string;
  billAllocations?: Array<{
    billType: "New Ref" | "Agst Ref" | "Advance" | "On Account";
    billName: string;
    amount: number;
  }>;
}

export function buildVoucherXml(params: {
  voucherType: string; // 'Sales', 'Purchase', 'Payment', 'Receipt', 'Credit Note', 'Debit Note', 'Journal'
  voucherNumber: string;
  date: string | Date;
  reference?: string | null;
  narration?: string | null;
  partyLedgerName?: string | null;
  guid?: string | null;
  inventoryEntries?: Array<{
    stockItemName: string;
    unit: string;
    quantity: number;
    rate: number;
    amount: number;
    discount?: number;
    accountingLedgerName: string; // e.g. 'Sales Account' or 'Purchase Account'
  }>;
  ledgerEntries: VoucherLedgerEntry[];
}): string {
  const tallyDate = formatTallyDate(params.date);

  const inventoryEntriesXml = (params.inventoryEntries || [])
    .map((inv) => {
      const isSales = params.voucherType.toLowerCase().includes("sales");
      // For sales: deemed positive = No, amount is negative in Tally inventory
      return `    <ALLINVENTORYENTRIES.LIST>
      <STOCKITEMNAME>${escapeXml(inv.stockItemName)}</STOCKITEMNAME>
      <ISDEEMEDPOSITIVE>${isSales ? "No" : "Yes"}</ISDEEMEDPOSITIVE>
      <RATE>${inv.rate}/${escapeXml(inv.unit || "Nos")}</RATE>
      <ACTUALQTY>${inv.quantity} ${escapeXml(inv.unit || "Nos")}</ACTUALQTY>
      <BILLEDQTY>${inv.quantity} ${escapeXml(inv.unit || "Nos")}</BILLEDQTY>
      <AMOUNT>${isSales ? -Math.abs(inv.amount) : Math.abs(inv.amount)}</AMOUNT>
      ${inv.discount ? `<DISCOUNT>${inv.discount}</DISCOUNT>` : ""}
      <ACCOUNTINGALLOCATIONS.LIST>
        <LEDGERNAME>${escapeXml(inv.accountingLedgerName)}</LEDGERNAME>
        <ISDEEMEDPOSITIVE>${isSales ? "No" : "Yes"}</ISDEEMEDPOSITIVE>
        <AMOUNT>${isSales ? -Math.abs(inv.amount) : Math.abs(inv.amount)}</AMOUNT>
      </ACCOUNTINGALLOCATIONS.LIST>
    </ALLINVENTORYENTRIES.LIST>`;
    })
    .join("\n");

  const ledgerEntriesXml = params.ledgerEntries
    .map((ledger) => {
      const isDeemedPositive = ledger.isDeemedPositive ?? ledger.amount > 0;
      // In Tally XML: Debits have positive/negative convention based on voucher and deemed positive
      const formattedAmount = isDeemedPositive ? Math.abs(ledger.amount) : -Math.abs(ledger.amount);

      const billAllocationsXml = (ledger.billAllocations || [])
        .map(
          (b) => `        <BILLALLOCATIONS.LIST>
          <NAME>${escapeXml(b.billName)}</NAME>
          <BILLTYPE>${escapeXml(b.billType)}</BILLTYPE>
          <AMOUNT>${b.amount}</AMOUNT>
        </BILLALLOCATIONS.LIST>`
        )
        .join("\n");

      return `    <ALLLEDGERENTRIES.LIST>
      <LEDGERNAME>${escapeXml(ledger.ledgerName)}</LEDGERNAME>
      <ISDEEMEDPOSITIVE>${isDeemedPositive ? "Yes" : "No"}</ISDEEMEDPOSITIVE>
      <ISPARTYLEDGER>${ledger.isPartyLedger ? "Yes" : "No"}</ISPARTYLEDGER>
      <AMOUNT>${formattedAmount}</AMOUNT>
      ${billAllocationsXml}
    </ALLLEDGERENTRIES.LIST>`;
    })
    .join("\n");

  return `<TALLYMESSAGE xmlns:UDF="TallyUDF">
  <VOUCHER VCHTYPE="${escapeXml(params.voucherType)}" ACTION="Create">
    <DATE>${tallyDate}</DATE>
    <VOUCHERTYPENAME>${escapeXml(params.voucherType)}</VOUCHERTYPENAME>
    <VOUCHERNUMBER>${escapeXml(params.voucherNumber)}</VOUCHERNUMBER>
    ${params.reference ? `<REFERENCE>${escapeXml(params.reference)}</REFERENCE>` : ""}
    ${params.partyLedgerName ? `<PARTYLEDGERNAME>${escapeXml(params.partyLedgerName)}</PARTYLEDGERNAME>` : ""}
    ${params.narration ? `<NARRATION>${escapeXml(params.narration)}</NARRATION>` : ""}
    ${params.guid ? `<GUID>${escapeXml(params.guid)}</GUID>` : ""}
${inventoryEntriesXml}
${ledgerEntriesXml}
  </VOUCHER>
</TALLYMESSAGE>`;
}
