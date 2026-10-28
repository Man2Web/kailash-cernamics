import { buildVoucherXml, wrapTallyEnvelope, VoucherLedgerEntry } from "../xml-builder";

export interface JournalSyncData {
  id: string;
  entryNo: string;
  date: string | Date;
  reference?: string | null;
  description?: string | null;
  items: Array<{
    accountName: string;
    debit: number;
    credit: number;
  }>;
}

export function mapJournalToTallyVoucher(journal: JournalSyncData, companyName?: string) {
  const ledgerEntries: VoucherLedgerEntry[] = journal.items.map((item) => {
    const isDebit = Number(item.debit) > 0;
    const amount = isDebit ? Number(item.debit) : -Number(item.credit);
    return {
      ledgerName: item.accountName,
      amount,
      isPartyLedger: false,
      isDeemedPositive: isDebit,
    };
  });

  const voucherXml = buildVoucherXml({
    voucherType: "Journal",
    voucherNumber: journal.entryNo,
    date: journal.date,
    reference: journal.reference || journal.entryNo,
    narration: journal.description || `Journal Entry #${journal.entryNo}`,
    guid: journal.id,
    ledgerEntries,
  });

  const fullXml = wrapTallyEnvelope(voucherXml, companyName);

  return {
    voucherNo: journal.entryNo,
    guid: journal.id,
    voucherXml,
    fullXml,
  };
}
