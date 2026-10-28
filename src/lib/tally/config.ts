import { TallySyncSettingsConfig } from "./types";

export const DEFAULT_TALLY_CONFIG = {
  host: process.env.TALLY_HOST || "localhost",
  port: parseInt(process.env.TALLY_PORT || "9000", 10),
  protocol: (process.env.TALLY_PROTOCOL || "http") as "http" | "https",
  companyName: process.env.TALLY_COMPANY_NAME || "Default Company",
  apiKey: process.env.TALLY_BRIDGE_API_KEY || "",
};

export const DEFAULT_SYNC_SETTINGS: Omit<TallySyncSettingsConfig, "id" | "connectionId"> = {
  autoSync: true,
  syncIntervalSeconds: 60,
  maxRetries: 5,
  retryDelaySeconds: 120,
  syncCustomers: true,
  syncVendors: true,
  syncProducts: true,
  syncSalesInvoices: true,
  syncPurchaseBills: true,
  syncPayments: true,
  syncReceipts: true,
  syncCreditNotes: true,
  syncDebitNotes: true,
  syncJournals: false,
  defaultDebtorGroup: "Sundry Debtors",
  defaultCreditorGroup: "Sundry Creditors",
  defaultSalesLedger: "Sales Account",
  defaultPurchaseLedger: "Purchase Account",
  defaultCgstLedger: "CGST",
  defaultSgstLedger: "SGST",
  defaultIgstLedger: "IGST",
  defaultRoundoffLedger: "Round Off",
  defaultBankLedger: "Bank Account",
  defaultCashLedger: "Cash",
};
