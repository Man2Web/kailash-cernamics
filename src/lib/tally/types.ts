export type TallyEntityType =
  | "CUSTOMER"
  | "VENDOR"
  | "PRODUCT"
  | "SALES_INVOICE"
  | "PURCHASE_BILL"
  | "PAYMENT"
  | "RECEIPT"
  | "CREDIT_NOTE"
  | "DEBIT_NOTE"
  | "JOURNAL";

export type TallySyncStatus =
  | "PENDING"
  | "PROCESSING"
  | "SYNCED"
  | "FAILED"
  | "RETRYING"
  | "CANCELLED";

export type TallyOperation = "CREATE" | "UPDATE" | "DELETE";

export type TallySyncDirection = "ERP_TO_TALLY" | "TALLY_TO_ERP";

export interface TallyConnectionConfig {
  id?: string;
  name: string;
  host: string;
  port: number;
  protocol: "http" | "https";
  companyName: string;
  integrationMode: "BRIDGE" | "DIRECT";
  apiKey: string;
  isActive: boolean;
  lastPingAt?: Date | null;
  lastSyncAt?: Date | null;
  status: "CONFIGURED" | "ONLINE" | "OFFLINE" | "ERROR";
}

export interface TallySyncSettingsConfig {
  id?: string;
  connectionId?: string;
  autoSync: boolean;
  syncIntervalSeconds: number;
  maxRetries: number;
  retryDelaySeconds: number;
  syncCustomers: boolean;
  syncVendors: boolean;
  syncProducts: boolean;
  syncSalesInvoices: boolean;
  syncPurchaseBills: boolean;
  syncPayments: boolean;
  syncReceipts: boolean;
  syncCreditNotes: boolean;
  syncDebitNotes: boolean;
  syncJournals: boolean;
  defaultDebtorGroup: string;
  defaultCreditorGroup: string;
  defaultSalesLedger: string;
  defaultPurchaseLedger: string;
  defaultCgstLedger: string;
  defaultSgstLedger: string;
  defaultIgstLedger: string;
  defaultRoundoffLedger: string;
  defaultBankLedger: string;
  defaultCashLedger: string;
}

export interface TallyQueueItem {
  id: string;
  entityType: TallyEntityType;
  entityId: string;
  entityCode?: string | null;
  entityName?: string | null;
  operation: TallyOperation;
  direction: TallySyncDirection;
  status: TallySyncStatus;
  payload: any;
  xmlRequest?: string | null;
  retryCount: number;
  maxRetries: number;
  lockedUntil?: Date | null;
  lockedBy?: string | null;
  lastError?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TallyParsedResponse {
  success: boolean;
  created: number;
  altered: number;
  errors: number;
  lastVchId?: string;
  guid?: string;
  errorMessage?: string;
  rawResponse?: string;
}

export interface TallySyncResult {
  jobId: string;
  success: boolean;
  tallyGuid?: string;
  tallyName?: string;
  tallyVoucherNo?: string;
  requestXml?: string;
  responseXml?: string;
  responseJson?: any;
  errorMessage?: string;
  durationMs?: number;
}
