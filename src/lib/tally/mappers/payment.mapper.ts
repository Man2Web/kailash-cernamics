import { buildVoucherXml, wrapTallyEnvelope, VoucherLedgerEntry } from "../xml-builder";

export interface PaymentSyncData {
  id: string;
  paymentNo: string;
  date: string | Date;
  partyName: string; // Vendor or Payee Ledger
  amount: number;
  paymentMode: string; // CASH, BANK, CHEQUE, UPI
  reference?: string | null;
  bankLedgerName?: string;
  cashLedgerName?: string;
  allocations?: Array<{
    billNo: string;
    amount: number;
  }>;
}

export function mapPaymentToTallyVoucher(payment: PaymentSyncData, companyName?: string) {
  const isCash = payment.paymentMode.toUpperCase() === "CASH";
  const moneyLedger = isCash
    ? payment.cashLedgerName || "Cash"
    : payment.bankLedgerName || "Bank Account";

  const ledgerEntries: VoucherLedgerEntry[] = [];

  // 1. Party Ledger (Debit for payment to vendor)
  const billAllocations = (payment.allocations || []).map((a) => ({
    billType: "Agst Ref" as const,
    billName: a.billNo,
    amount: Number(a.amount),
  }));

  ledgerEntries.push({
    ledgerName: payment.partyName,
    amount: Number(payment.amount),
    isPartyLedger: true,
    isDeemedPositive: true, // Debit
    billAllocations: billAllocations.length > 0 ? billAllocations : undefined,
  });

  // 2. Bank / Cash Ledger (Credit)
  ledgerEntries.push({
    ledgerName: moneyLedger,
    amount: -Number(payment.amount),
    isPartyLedger: false,
    isDeemedPositive: false, // Credit
  });

  const voucherXml = buildVoucherXml({
    voucherType: "Payment",
    voucherNumber: payment.paymentNo,
    date: payment.date,
    reference: payment.reference || payment.paymentNo,
    narration: `Payment #${payment.paymentNo} to ${payment.partyName} via ${payment.paymentMode}`,
    partyLedgerName: payment.partyName,
    guid: payment.id,
    ledgerEntries,
  });

  const fullXml = wrapTallyEnvelope(voucherXml, companyName);

  return {
    voucherNo: payment.paymentNo,
    guid: payment.id,
    voucherXml,
    fullXml,
  };
}
