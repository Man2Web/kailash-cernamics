/**
 * Comprehensive Automated Tests for TallyPrime Integration
 */

const {
  escapeXml,
  formatTallyDate,
  buildLedgerXml,
  buildStockItemXml,
  buildVoucherXml,
  wrapTallyEnvelope,
} = require("./src/lib/tally/xml-builder");

const { parseTallyResponse } = require("./src/lib/tally/response-parser");
const { mapCustomerToTallyLedger } = require("./src/lib/tally/mappers/customer.mapper");
const { mapVendorToTallyLedger } = require("./src/lib/tally/mappers/vendor.mapper");
const { mapProductToTallyStockItem } = require("./src/lib/tally/mappers/product.mapper");
const { mapInvoiceToTallySalesVoucher } = require("./src/lib/tally/mappers/invoice.mapper");
const { mapPurchaseBillToTallyVoucher } = require("./src/lib/tally/mappers/purchase.mapper");
const { mapPaymentToTallyVoucher } = require("./src/lib/tally/mappers/payment.mapper");
const { mapReceiptToTallyVoucher } = require("./src/lib/tally/mappers/receipt.mapper");
const { mapCreditNoteToTallyVoucher } = require("./src/lib/tally/mappers/credit-note.mapper");
const { mapDebitNoteToTallyVoucher } = require("./src/lib/tally/mappers/debit-note.mapper");

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

console.log("\n=================================================");
console.log("    RUNNING TALLY INTEGRATION AUTOMATED TESTS    ");
console.log("=================================================\n");

// TEST 1: Customer Mapper
console.log("1. Testing Customer to Tally Ledger Mapping...");
const mockCustomer = {
  id: "cust-uuid-101",
  name: "Acme Enterprises Private Limited",
  code: "CUST-001",
  gstin: "27AABCU9603R1ZM",
  email: "billing@acme.com",
  phone: "+91 9876543210",
  creditLimit: 500000,
  outstandingAmt: 12500,
  addresses: [
    {
      type: "BILLING",
      address: "123 Industrial Area, Phase II",
      city: "Mumbai",
      state: "Maharashtra",
      pincode: "400001",
      isDefault: true,
    },
  ],
};

const customerResult = mapCustomerToTallyLedger(mockCustomer, "Demo Company");
assert(customerResult.ledgerName === "Acme Enterprises Private Limited", "Customer name matches ledger name");
assert(customerResult.fullXml.includes("<PARENT>Sundry Debtors</PARENT>"), "Customer mapped to Sundry Debtors parent");
assert(customerResult.fullXml.includes("<PARTYGSTIN>27AABCU9603R1ZM</PARTYGSTIN>"), "GSTIN correctly embedded in XML");
assert(customerResult.fullXml.includes("<STATENAME>Maharashtra</STATENAME>"), "State mapped correctly");
assert(customerResult.fullXml.includes("<CREDITLIMIT>500000</CREDITLIMIT>"), "Credit limit mapped");
assert(customerResult.fullXml.includes("<OPENINGBALANCE>12500</OPENINGBALANCE>"), "Debtor opening balance signed positive");

// TEST 2: Vendor Mapper
console.log("\n2. Testing Vendor to Tally Ledger Mapping...");
const mockVendor = {
  id: "vend-uuid-202",
  name: "Global Steel Traders",
  code: "VEND-001",
  gstin: "29BBBCU9603R1ZM",
  email: "sales@globalsteel.in",
  phone: "080-2345678",
  outstandingAmt: 75000,
  addresses: [
    {
      type: "BILLING",
      address: "45 Industrial Layout",
      city: "Bengaluru",
      state: "Karnataka",
      pincode: "560001",
    },
  ],
};

const vendorResult = mapVendorToTallyLedger(mockVendor, "Demo Company");
assert(vendorResult.ledgerName === "Global Steel Traders", "Vendor name matches ledger name");
assert(vendorResult.fullXml.includes("<PARENT>Sundry Creditors</PARENT>"), "Vendor mapped to Sundry Creditors parent");
assert(vendorResult.fullXml.includes("<PARTYGSTIN>29BBBCU9603R1ZM</PARTYGSTIN>"), "Vendor GSTIN mapped");
assert(vendorResult.fullXml.includes("<OPENINGBALANCE>-75000</OPENINGBALANCE>"), "Creditor opening balance signed negative (Credit)");

// TEST 3: Product Mapper
console.log("\n3. Testing Product to Tally Stock Item Mapping...");
const mockProduct = {
  id: "prod-uuid-303",
  name: "Aluminium Profile 40x40",
  sku: "ALU-4040",
  code: "PRD-001",
  hsnCode: "760429",
  description: "Standard industrial aluminium extrusion",
  purchasePrice: 450,
  sellingPrice: 650,
  gstRate: 18,
  unitName: "Mtr",
  openingStock: 100,
};

const productResult = mapProductToTallyStockItem(mockProduct, "Demo Company");
assert(productResult.stockItemName === "Aluminium Profile 40x40", "Stock item name matches");
assert(productResult.fullXml.includes("<BASEUNITS>Mtr</BASEUNITS>"), "Base unit mapped");
assert(productResult.fullXml.includes("<HSNCODE>760429</HSNCODE>"), "HSN code mapped");
assert(productResult.fullXml.includes("<GSTRATE>18</GSTRATE>"), "GST rate mapped");
assert(productResult.fullXml.includes("<OPENINGBALANCE>100 Mtr</OPENINGBALANCE>"), "Opening balance stock quantity mapped");

// TEST 4: Sales Invoice with Intrastate GST (CGST + SGST) & Round Off
console.log("\n4. Testing Sales Invoice Mapping (Intrastate CGST + SGST)...");
const mockInvoiceIntrastate = {
  id: "inv-uuid-404",
  invoiceNo: "INV/2026/001",
  date: "2026-08-20",
  dueDate: "2026-09-20",
  customerName: "Acme Enterprises Private Limited",
  customerGstin: "27AABCU9603R1ZM",
  billingAddress: "Mumbai, Maharashtra",
  billingState: "Maharashtra",
  totalTaxable: 10000,
  totalTax: 1800,
  totalPayable: 11800,
  roundOff: 0,
  items: [
    {
      productName: "Aluminium Profile 40x40",
      unitName: "Mtr",
      quantity: 10,
      rate: 1000,
      discount: 0,
      taxableAmt: 10000,
      gstRate: 18,
      cgstAmt: 900,
      sgstAmt: 900,
      igstAmt: 0,
      totalAmt: 11800,
    },
  ],
};

const invoiceIntraResult = mapInvoiceToTallySalesVoucher(mockInvoiceIntrastate, "Demo Company");
assert(invoiceIntraResult.voucherNo === "INV/2026/001", "Voucher number matches");
assert(invoiceIntraResult.fullXml.includes('<VOUCHER VCHTYPE="Sales"'), "Voucher type is Sales");
assert(invoiceIntraResult.fullXml.includes("<PARTYLEDGERNAME>Acme Enterprises Private Limited</PARTYLEDGERNAME>"), "Party ledger mapped");
assert(invoiceIntraResult.fullXml.includes("<LEDGERNAME>CGST</LEDGERNAME>"), "Intrastate CGST ledger included");
assert(invoiceIntraResult.fullXml.includes("<LEDGERNAME>SGST</LEDGERNAME>"), "Intrastate SGST ledger included");
assert(!invoiceIntraResult.fullXml.includes("<LEDGERNAME>IGST</LEDGERNAME>"), "Interstate IGST excluded for intrastate invoice");
assert(invoiceIntraResult.fullXml.includes("<BILLTYPE>New Ref</BILLTYPE>"), "Bill allocation has New Ref");

// TEST 5: Sales Invoice with Interstate GST (IGST)
console.log("\n5. Testing Sales Invoice Mapping (Interstate IGST)...");
const mockInvoiceInterstate = {
  id: "inv-uuid-405",
  invoiceNo: "INV/2026/002",
  date: "2026-08-20",
  customerName: "Global Steel Traders",
  totalTaxable: 5000,
  totalTax: 900,
  totalPayable: 5900,
  roundOff: 0,
  items: [
    {
      productName: "Aluminium Profile 40x40",
      unitName: "Mtr",
      quantity: 5,
      rate: 1000,
      taxableAmt: 5000,
      gstRate: 18,
      cgstAmt: 0,
      sgstAmt: 0,
      igstAmt: 900,
      totalAmt: 5900,
    },
  ],
};

const invoiceInterResult = mapInvoiceToTallySalesVoucher(mockInvoiceInterstate, "Demo Company");
assert(invoiceInterResult.fullXml.includes("<LEDGERNAME>IGST</LEDGERNAME>"), "Interstate IGST ledger included");
assert(!invoiceInterResult.fullXml.includes("<LEDGERNAME>CGST</LEDGERNAME>"), "CGST excluded for interstate invoice");

// TEST 6: Purchase Bill Mapping
console.log("\n6. Testing Purchase Bill Mapping...");
const mockBill = {
  id: "bill-uuid-505",
  billNo: "PB/2026/088",
  date: "2026-08-20",
  vendorName: "Global Steel Traders",
  totalTaxable: 20000,
  totalTax: 3600,
  totalPayable: 23600,
  items: [
    {
      productName: "Raw Steel Billet",
      unitName: "Kg",
      quantity: 500,
      rate: 40,
      taxableAmt: 20000,
      gstRate: 18,
      cgstAmt: 1800,
      sgstAmt: 1800,
      igstAmt: 0,
    },
  ],
};

const billResult = mapPurchaseBillToTallyVoucher(mockBill, "Demo Company");
assert(billResult.voucherNo === "PB/2026/088", "Purchase bill number matches");
assert(billResult.fullXml.includes('<VOUCHER VCHTYPE="Purchase"'), "Voucher type is Purchase");
assert(billResult.fullXml.includes("<LEDGERNAME>Global Steel Traders</LEDGERNAME>"), "Vendor ledger mapped");
assert(billResult.fullXml.includes("<LEDGERNAME>Purchase Account</LEDGERNAME>"), "Purchase account mapped");

// TEST 7: Payment & Receipt Mapping
console.log("\n7. Testing Payment and Receipt Voucher Mapping...");
const mockPayment = {
  id: "pay-uuid-606",
  paymentNo: "PAY-2026-001",
  date: "2026-08-20",
  partyName: "Global Steel Traders",
  amount: 23600,
  paymentMode: "BANK",
  reference: "NEFT-12345",
  bankLedgerName: "HDFC Bank Ltd",
  allocations: [{ billNo: "PB/2026/088", amount: 23600 }],
};
const paymentResult = mapPaymentToTallyVoucher(mockPayment, "Demo Company");
assert(paymentResult.fullXml.includes('<VOUCHER VCHTYPE="Payment"'), "Payment voucher type matches");
assert(paymentResult.fullXml.includes("<LEDGERNAME>HDFC Bank Ltd</LEDGERNAME>"), "Bank ledger credited");
assert(paymentResult.fullXml.includes("<BILLTYPE>Agst Ref</BILLTYPE>"), "Bill allocation has Agst Ref");

const mockReceipt = {
  id: "rec-uuid-707",
  receiptNo: "REC-2026-001",
  date: "2026-08-20",
  customerName: "Acme Enterprises Private Limited",
  amount: 11800,
  paymentMode: "CASH",
  cashLedgerName: "Cash",
  allocations: [{ invoiceNo: "INV/2026/001", amount: 11800 }],
};
const receiptResult = mapReceiptToTallyVoucher(mockReceipt, "Demo Company");
assert(receiptResult.fullXml.includes('<VOUCHER VCHTYPE="Receipt"'), "Receipt voucher type matches");
assert(receiptResult.fullXml.includes("<LEDGERNAME>Cash</LEDGERNAME>"), "Cash ledger debited");

// TEST 8: Response Parser
console.log("\n8. Testing Tally XML Response Parser...");
const mockSuccessXml = `
<RESPONSE>
  <CREATED>1</CREATED>
  <ALTERED>0</ALTERED>
  <ERRORS>0</ERRORS>
  <LASTVCHID>998811</LASTVCHID>
  <GUID>37c95e1e-7b56-42d8-bf5b-c2e43bc37ff3</GUID>
</RESPONSE>
`;
const parsedSuccess = parseTallyResponse(mockSuccessXml);
assert(parsedSuccess.success === true, "Parsed success is true");
assert(parsedSuccess.created === 1, "Parsed created count is 1");
assert(parsedSuccess.lastVchId === "998811", "Parsed lastVchId correctly");
assert(parsedSuccess.guid === "37c95e1e-7b56-42d8-bf5b-c2e43bc37ff3", "Parsed GUID correctly");

const mockErrorXml = `
<RESPONSE>
  <CREATED>0</CREATED>
  <ALTERED>0</ALTERED>
  <ERRORS>1</ERRORS>
  <LINEERROR>Ledger 'Sales Account' does not exist!</LINEERROR>
</RESPONSE>
`;
const parsedError = parseTallyResponse(mockErrorXml);
assert(parsedError.success === false, "Parsed error is false");
assert(parsedError.errors === 1, "Parsed errors count is 1");
assert(parsedError.errorMessage === "Ledger 'Sales Account' does not exist!", "Extracted line error correctly");

console.log("\n=================================================");
console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log("=================================================\n");

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
