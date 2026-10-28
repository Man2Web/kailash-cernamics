import { buildVoucherXml, wrapTallyEnvelope, VoucherLedgerEntry } from "../xml-builder";

export interface PurchaseBillItemSyncData {
  productName: string;
  unitName?: string;
  quantity: number;
  rate: number;
  taxableAmt: number;
  gstRate: number;
  cgstAmt: number;
  sgstAmt: number;
  igstAmt: number;
}

export interface PurchaseBillSyncData {
  id: string;
  billNo: string;
  date: string | Date;
  vendorName: string;
  totalTaxable: number;
  totalTax: number;
  totalPayable: number;
  items: PurchaseBillItemSyncData[];
  
  // Custom Ledgers Config
  purchaseLedger?: string;
  inputCgstLedger?: string;
  inputSgstLedger?: string;
  inputIgstLedger?: string;
  roundoffLedger?: string;
}

export function mapPurchaseBillToTallyVoucher(bill: PurchaseBillSyncData, companyName?: string) {
  const purchaseLedger = bill.purchaseLedger || "Purchase Account";
  const cgstLedger = bill.inputCgstLedger || "Input CGST";
  const sgstLedger = bill.inputSgstLedger || "Input SGST";
  const igstLedger = bill.inputIgstLedger || "Input IGST";

  // 1. Inventory entries (Debit)
  const inventoryEntries = bill.items.map((item) => ({
    stockItemName: item.productName,
    unit: item.unitName || "Nos",
    quantity: Number(item.quantity),
    rate: Number(item.rate),
    amount: Number(item.taxableAmt),
    accountingLedgerName: purchaseLedger,
  }));

  // 2. Ledger entries
  const ledgerEntries: VoucherLedgerEntry[] = [];

  // A. Party Ledger (Vendor - Credit)
  ledgerEntries.push({
    ledgerName: bill.vendorName,
    amount: -Number(bill.totalPayable),
    isPartyLedger: true,
    isDeemedPositive: false, // Credit
    billAllocations: [
      {
        billType: "New Ref",
        billName: bill.billNo,
        amount: -Number(bill.totalPayable),
      },
    ],
  });

  // Calculate total input taxes
  let totalCGST = 0;
  let totalSGST = 0;
  let totalIGST = 0;

  bill.items.forEach((item) => {
    totalCGST += Number(item.cgstAmt || 0);
    totalSGST += Number(item.sgstAmt || 0);
    totalIGST += Number(item.igstAmt || 0);
  });

  // B. Input Tax Ledgers (Debit)
  if (totalCGST > 0) {
    ledgerEntries.push({
      ledgerName: cgstLedger,
      amount: totalCGST,
      isPartyLedger: false,
      isDeemedPositive: true, // Debit
    });
  }

  if (totalSGST > 0) {
    ledgerEntries.push({
      ledgerName: sgstLedger,
      amount: totalSGST,
      isPartyLedger: false,
      isDeemedPositive: true, // Debit
    });
  }

  if (totalIGST > 0) {
    ledgerEntries.push({
      ledgerName: igstLedger,
      amount: totalIGST,
      isPartyLedger: false,
      isDeemedPositive: true, // Debit
    });
  }

  const voucherXml = buildVoucherXml({
    voucherType: "Purchase",
    voucherNumber: bill.billNo,
    date: bill.date,
    reference: bill.billNo,
    narration: `Purchase Bill #${bill.billNo} from ${bill.vendorName}`,
    partyLedgerName: bill.vendorName,
    guid: bill.id,
    inventoryEntries,
    ledgerEntries,
  });

  const fullXml = wrapTallyEnvelope(voucherXml, companyName);

  return {
    voucherNo: bill.billNo,
    guid: bill.id,
    voucherXml,
    fullXml,
  };
}
