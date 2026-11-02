// Company-wide module switches. The Super Admin turns whole processes on or off (Settings > Modules on/off).
// A module that is off disappears from menus and the dashboard for everyone, and the API refuses its routes.
// Catalogue, customers and suppliers, branches, users and settings are the foundation and are always on.

export const FEATURES = [
  { key: "sales", label: "Sales", description: "Quotations, sales orders, invoices, challans and dispatch, returns and credit notes." },
  { key: "purchase", label: "Purchase", description: "Purchase orders, goods receipts (GRN), purchase invoices, debit notes, brand schemes and breakage claims." },
  { key: "inventory", label: "Inventory & stock", description: "Stock, ledger, transfers, adjustments, counts, shade lots, labels, samples and display boards." },
  { key: "accounts", label: "Accounts", description: "Receipts, supplier payments, outstanding, party statements and the cheque register." },
  { key: "crm", label: "CRM", description: "Leads, follow-ups, site visits and influencers." },
  { key: "reports", label: "Reports", description: "The reports library." },
  { key: "office", label: "Office (employees & attendance)", description: "Employee records, the attendance QR screen, check-in and check-out." },
  { key: "tally", label: "Tally", description: "Sync of invoices, receipts and masters to Tally through the desktop agent." },
] as const;

export type FeatureKey = (typeof FEATURES)[number]["key"];
export const FEATURE_KEYS = FEATURES.map((f) => f.key) as FeatureKey[];
export type FeatureFlags = Record<FeatureKey, boolean>;

/** The first path segment of an API route (after /api) and the module it belongs to. Anything not listed is always on. */
export const ROUTE_FEATURE: Record<string, FeatureKey> = {
  // sales
  quotations: "sales",
  "sales-orders": "sales",
  invoices: "sales",
  challans: "sales",
  dispatches: "sales",
  "sales-returns": "sales",
  "credit-notes": "sales",
  sales: "sales",
  credit: "sales",
  gst: "sales",
  // purchase
  "purchase-orders": "purchase",
  grns: "purchase",
  "purchase-invoices": "purchase",
  "debit-notes": "purchase",
  schemes: "purchase",
  "breakage-claims": "purchase",
  // inventory
  stock: "inventory",
  "display-boards": "inventory",
  samples: "inventory",
  labels: "inventory",
  scan: "inventory",
  batches: "inventory",
  // accounts
  receipts: "accounts",
  payments: "accounts",
  outstanding: "accounts",
  statements: "accounts",
  cheques: "accounts",
  // crm
  leads: "crm",
  followups: "crm",
  "site-visits": "crm",
  influencers: "crm",
  "influencer-payouts": "crm",
  crm: "crm",
  // reports
  reports: "reports",
  // office
  employees: "office",
  attendance: "office",
  // tally
  tally: "tally",
};
