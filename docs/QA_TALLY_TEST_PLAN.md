# TallyPrime Integration QA Plan & Resilience Audit

## 1. Overview
The TallyPrime integration in SixOrbit ERP bridges PostgreSQL ERP records into Tally XML format across three primary entity categories:
1. **Master Ledgers** (Sundry Debtors & Sundry Creditors)
2. **Stock Items** (Inventory items with HSN and GST classifications)
3. **Accounting Vouchers** (Sales Invoices with Intrastate / Interstate GST splits)

---

## 2. Tested XML Formats & Structures

### A. Customer / Debtor Ledger XML
- **Mapping Function**: `mapCustomerToTallyLedger(customer, companyName)`
- **Validated Tags**:
  - `<LEDGER NAME="...">`
  - `<PARENT>Sundry Debtors</PARENT>`
  - `<PARTYGSTIN>...</PARTYGSTIN>`
  - `<COUNTRYNAME>India</COUNTRYNAME>`
  - `<LEDSTATENAME>...</LEDSTATENAME>`

### B. Product / Stock Item XML
- **Mapping Function**: `mapProductToTallyStockItem(product, companyName)`
- **Validated Tags**:
  - `<STOCKITEM NAME="...">`
  - `<BASEUNITS>NOS</BASEUNITS>`
  - `<HSNCODE>...</HSNCODE>`
  - `<GSTRATEDETAILS.LIST>`

### C. Sales Invoice Voucher XML
- **Mapping Function**: `mapInvoiceToTallySalesVoucher(invoice, companyName)`
- **Validated Tags**:
  - `<VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>`
  - `<PARTYLEDGERNAME>...</PARTYLEDGERNAME>`
  - `<ALLLEDGERENTRIES.LIST>` for Sales Ledger, CGST, SGST, IGST
  - `<ALLINVENTORYENTRIES.LIST>` for line items, quantities, rates, and amounts

---

## 3. Resilience & Offline Tolerance Testing

| Test Case | Scenario | Expected Result | Status |
|---|---|---|---|
| **Offline Bridge** | TallyPrime service / bridge is unreachable | ERP sales invoice creation and database operations succeed without blocking or failing; sync job remains safely queued | ✅ PASS |
| **Idempotency** | Duplicate sync requests submitted for same invoice | Unique GUID and entity mappings prevent duplicate ledger entries in Tally | ✅ PASS |
| **Response Parsing** | Tally returns `<CREATED>1</CREATED><LASTVCHID>10045</LASTVCHID>` | Parser extracts status, altered count, last voucher ID, and GUID correctly | ✅ PASS |
| **Error Handling** | Missing `tally_connections` table access | Handlers degrade gracefully with default offline status rather than crashing | ✅ PASS |
