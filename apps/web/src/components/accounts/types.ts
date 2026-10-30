// Shapes returned by the accounts API.
export interface ReceiptRow {
  id: string;
  number: string;
  date: string;
  mode: string;
  amountPaise: number;
  unallocatedPaise: number;
  reference: string | null;
  chequeNo: string | null;
  chequeStatus: string | null;
  status: string;
  syncStatus: string;
  source: string;
  party: { id: string; name: string; phone: string | null };
}
