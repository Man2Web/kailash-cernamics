import { buildVoucherXml, wrapTallyEnvelope, VoucherLedgerEntry } from "../xml-builder";

export interface DebitNoteSyncData {
  id: string;
  noteNo: string;
  originalBillNo?: string;
  date: string | Date;
  vendorName: string;
  amount: number;
  taxableAmount: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  reason?: string;
  purchaseReturnLedger?: string;
  inputCgstLedger?: string;
  inputSgstLedger?: string;
  inputIgstLedger?: string;
}

export function mapDebitNoteToTallyVoucher(note: DebitNoteSyncData, companyName?: string) {
  const returnLedger = note.purchaseReturnLedger || "Purchase Return";
  const cgstLedger = note.inputCgstLedger || "Input CGST";
  const sgstLedger = note.inputSgstLedger || "Input SGST";
  const igstLedger = note.inputIgstLedger || "Input IGST";

  const ledgerEntries: VoucherLedgerEntry[] = [];

  // 1. Vendor Ledger (Debit)
  const billAllocations = note.originalBillNo
    ? [
        {
          billType: "Agst Ref" as const,
          billName: note.originalBillNo,
          amount: Number(note.amount),
        },
      ]
    : undefined;

  ledgerEntries.push({
    ledgerName: note.vendorName,
    amount: Number(note.amount),
    isPartyLedger: true,
    isDeemedPositive: true,
    billAllocations,
  });

  // 2. Purchase Return Ledger (Credit)
  ledgerEntries.push({
    ledgerName: returnLedger,
    amount: -Number(note.taxableAmount),
    isPartyLedger: false,
    isDeemedPositive: false,
  });

  // 3. Tax Reversals (Credit)
  if (note.cgstAmount && note.cgstAmount > 0) {
    ledgerEntries.push({
      ledgerName: cgstLedger,
      amount: -Number(note.cgstAmount),
      isPartyLedger: false,
      isDeemedPositive: false,
    });
  }
  if (note.sgstAmount && note.sgstAmount > 0) {
    ledgerEntries.push({
      ledgerName: sgstLedger,
      amount: -Number(note.sgstAmount),
      isPartyLedger: false,
      isDeemedPositive: false,
    });
  }
  if (note.igstAmount && note.igstAmount > 0) {
    ledgerEntries.push({
      ledgerName: igstLedger,
      amount: -Number(note.igstAmount),
      isPartyLedger: false,
      isDeemedPositive: false,
    });
  }

  const voucherXml = buildVoucherXml({
    voucherType: "Debit Note",
    voucherNumber: note.noteNo,
    date: note.date,
    reference: note.originalBillNo || note.noteNo,
    narration: `Debit Note #${note.noteNo} to ${note.vendorName}. Reason: ${note.reason || "Purchase Return"}`,
    partyLedgerName: note.vendorName,
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
