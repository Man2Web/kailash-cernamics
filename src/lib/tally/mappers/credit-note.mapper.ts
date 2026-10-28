import { buildVoucherXml, wrapTallyEnvelope, VoucherLedgerEntry } from "../xml-builder";

export interface CreditNoteSyncData {
  id: string;
  noteNo: string;
  originalInvoiceNo?: string;
  date: string | Date;
  customerName: string;
  amount: number;
  taxableAmount: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  reason?: string;
  salesReturnLedger?: string;
  cgstLedger?: string;
  sgstLedger?: string;
  igstLedger?: string;
}

export function mapCreditNoteToTallyVoucher(note: CreditNoteSyncData, companyName?: string) {
  const returnLedger = note.salesReturnLedger || "Sales Return";
  const cgstLedger = note.cgstLedger || "CGST";
  const sgstLedger = note.sgstLedger || "SGST";
  const igstLedger = note.igstLedger || "IGST";

  const ledgerEntries: VoucherLedgerEntry[] = [];

  // 1. Sales Return / Revenue (Debit)
  ledgerEntries.push({
    ledgerName: returnLedger,
    amount: Number(note.taxableAmount),
    isPartyLedger: false,
    isDeemedPositive: true,
  });

  // 2. Tax Reversals (Debit)
  if (note.cgstAmount && note.cgstAmount > 0) {
    ledgerEntries.push({
      ledgerName: cgstLedger,
      amount: Number(note.cgstAmount),
      isPartyLedger: false,
      isDeemedPositive: true,
    });
  }
  if (note.sgstAmount && note.sgstAmount > 0) {
    ledgerEntries.push({
      ledgerName: sgstLedger,
      amount: Number(note.sgstAmount),
      isPartyLedger: false,
      isDeemedPositive: true,
    });
  }
  if (note.igstAmount && note.igstAmount > 0) {
    ledgerEntries.push({
      ledgerName: igstLedger,
      amount: Number(note.igstAmount),
      isPartyLedger: false,
      isDeemedPositive: true,
    });
  }

  // 3. Customer Ledger (Credit)
  const billAllocations = note.originalInvoiceNo
    ? [
        {
          billType: "Agst Ref" as const,
          billName: note.originalInvoiceNo,
          amount: -Number(note.amount),
        },
      ]
    : undefined;

  ledgerEntries.push({
    ledgerName: note.customerName,
    amount: -Number(note.amount),
    isPartyLedger: true,
    isDeemedPositive: false,
    billAllocations,
  });

  const voucherXml = buildVoucherXml({
    voucherType: "Credit Note",
    voucherNumber: note.noteNo,
    date: note.date,
    reference: note.originalInvoiceNo || note.noteNo,
    narration: `Credit Note #${note.noteNo} for ${note.customerName}. Reason: ${note.reason || "Sales Return"}`,
    partyLedgerName: note.customerName,
    guid: note.id,
    ledgerEntries,
  });

  const fullXml = wrapTallyEnvelope(voucherXml, companyName);

  return {
    voucherNo: note.noteNo,
    guid: note.id,
    voucherXml,
    fullXml,
  };
}
