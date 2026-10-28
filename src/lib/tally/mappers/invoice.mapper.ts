import { buildVoucherXml, wrapTallyEnvelope, VoucherLedgerEntry } from "../xml-builder";

export interface InvoiceItemSyncData {
  productName: string;
  unitName?: string;
  quantity: number;
  rate: number;
  discount?: number;
  taxableAmt: number;
  gstRate: number;
  cgstAmt: number;
  sgstAmt: number;
  igstAmt: number;
  totalAmt: string | number;
}

export interface InvoiceSyncData {
  id: string;
  invoiceNo: string;
  date: string | Date;
  dueDate?: string | Date;
  customerName: string;
  customerGstin?: string | null;
  billingAddress?: string;
  billingState?: string;
  totalTaxable: number;
  totalTax: number;
  totalPayable: number;
  roundOff?: number;
  items: InvoiceItemSyncData[];
  
  // Custom Ledgers Config
  salesLedger?: string;
  cgstLedger?: string;
  sgstLedger?: string;
  igstLedger?: string;
  roundoffLedger?: string;
}

export function mapInvoiceToTallySalesVoucher(invoice: InvoiceSyncData, companyName?: string) {
  const salesLedger = invoice.salesLedger || "Sales Account";
  const cgstLedger = invoice.cgstLedger || "CGST";
  const sgstLedger = invoice.sgstLedger || "SGST";
  const igstLedger = invoice.igstLedger || "IGST";
  const roundoffLedger = invoice.roundoffLedger || "Round Off";

  // 1. Inventory entries
  const inventoryEntries = invoice.items.map((item) => ({
    stockItemName: item.productName,
    unit: item.unitName || "Nos",
    quantity: Number(item.quantity),
    rate: Number(item.rate),
    amount: Number(item.taxableAmt),
    discount: item.discount ? Number(item.discount) : undefined,
    accountingLedgerName: salesLedger,
  }));

  // 2. Ledger entries
  const ledgerEntries: VoucherLedgerEntry[] = [];

  // A. Party Ledger (Customer - Debit)
  ledgerEntries.push({
    ledgerName: invoice.customerName,
    amount: Number(invoice.totalPayable),
    isPartyLedger: true,
    isDeemedPositive: true, // Debit
    billAllocations: [
      {
        billType: "New Ref",
        billName: invoice.invoiceNo,
        amount: Number(invoice.totalPayable),
      },
    ],
  });

  // Calculate total taxes
  let totalCGST = 0;
  let totalSGST = 0;
  let totalIGST = 0;

  invoice.items.forEach((item) => {
    totalCGST += Number(item.cgstAmt || 0);
    totalSGST += Number(item.sgstAmt || 0);
    totalIGST += Number(item.igstAmt || 0);
  });

  // B. Tax Ledgers (Credit)
  if (totalCGST > 0) {
    ledgerEntries.push({
      ledgerName: cgstLedger,
      amount: -totalCGST,
      isPartyLedger: false,
      isDeemedPositive: false, // Credit
    });
  }

  if (totalSGST > 0) {
    ledgerEntries.push({
      ledgerName: sgstLedger,
      amount: -totalSGST,
      isPartyLedger: false,
      isDeemedPositive: false, // Credit
    });
  }

  if (totalIGST > 0) {
    ledgerEntries.push({
      ledgerName: igstLedger,
      amount: -totalIGST,
      isPartyLedger: false,
      isDeemedPositive: false, // Credit
    });
  }

  // C. Round-off Ledger if applicable
  const roundOff = invoice.roundOff ? Number(invoice.roundOff) : 0;
  if (roundOff !== 0) {
    ledgerEntries.push({
      ledgerName: roundoffLedger,
      amount: -roundOff,
      isPartyLedger: false,
      isDeemedPositive: roundOff < 0, // if roundoff is negative, deemed positive (debit)
    });
  }

  const voucherXml = buildVoucherXml({
    voucherType: "Sales",
    voucherNumber: invoice.invoiceNo,
    date: invoice.date,
    reference: invoice.invoiceNo,
    narration: `Sales Invoice #${invoice.invoiceNo} for ${invoice.customerName}`,
    partyLedgerName: invoice.customerName,
    guid: invoice.id,
    inventoryEntries,
    ledgerEntries,
  });

  const fullXml = wrapTallyEnvelope(voucherXml, companyName);

  return {
    voucherNo: invoice.invoiceNo,
    guid: invoice.id,
    voucherXml,
    fullXml,
  };
}
