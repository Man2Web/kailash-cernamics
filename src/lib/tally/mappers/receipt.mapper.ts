import { buildVoucherXml, wrapTallyEnvelope, VoucherLedgerEntry } from "../xml-builder";

export interface ReceiptSyncData {
  id: string;
  receiptNo: string;
  date: string | Date;
  customerName: string;
  amount: number;
  paymentMode: string; // CASH, BANK, CHEQUE, UPI
  reference?: string | null;
  bankLedgerName?: string;
  cashLedgerName?: string;
  allocations?: Array<{
    invoiceNo: string;
    amount: number;
  }>;
}

export function mapReceiptToTallyVoucher(receipt: ReceiptSyncData, companyName?: string) {
  const isCash = receipt.paymentMode.toUpperCase() === "CASH";
  const moneyLedger = isCash
    ? receipt.cashLedgerName || "Cash"
    : receipt.bankLedgerName || "Bank Account";

  const ledgerEntries: VoucherLedgerEntry[] = [];

  // 1. Bank / Cash Ledger (Debit)
  ledgerEntries.push({
    ledgerName: moneyLedger,
    amount: Number(receipt.amount),
    isPartyLedger: false,
    isDeemedPositive: true, // Debit
  });

  // 2. Customer Ledger (Credit)
  const billAllocations = (receipt.allocations || []).map((a) => ({
    billType: "Agst Ref" as const,
    billName: a.invoiceNo,
    amount: -Number(a.amount),
  }));

  ledgerEntries.push({
    ledgerName: receipt.customerName,
    amount: -Number(receipt.amount),
    isPartyLedger: true,
    isDeemedPositive: false, // Credit
    billAllocations: billAllocations.length > 0 ? billAllocations : undefined,
  });

  const voucherXml = buildVoucherXml({
    voucherType: "Receipt",
    voucherNumber: receipt.receiptNo,
    date: receipt.date,
    reference: receipt.reference || receipt.receiptNo,
    narration: `Receipt #${receipt.receiptNo} from ${receipt.customerName} via ${receipt.paymentMode}`,
    partyLedgerName: receipt.customerName,
    guid: receipt.id,
    ledgerEntries,
  });

  const fullXml = wrapTallyEnvelope(voucherXml, companyName);

  return {
    voucherNo: receipt.receiptNo,
    guid: receipt.id,
    voucherXml,
    fullXml,
  };
}
