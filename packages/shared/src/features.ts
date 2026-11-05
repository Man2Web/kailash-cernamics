// Company-wide switches. The Super Admin turns whole processes (modules) on or off, and inside a module can turn
// single parts off, e.g. Sales on but Invoices off (Settings > Modules on/off). Something that is off disappears from
// menus and buttons for everyone, and the API refuses its routes. Each switch is saved; everything is on by default.
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

/** A part of a module that can be switched off on its own. The key is "<module>.<part>". */
export const FEATURE_PARTS = [
  // sales
  { key: "sales.quotations", module: "sales", label: "Quotations", description: "Room-wise quotations, revisions and sharing." },
  { key: "sales.orders", module: "sales", label: "Sales orders", description: "Orders that reserve stock from one batch." },
  { key: "sales.invoices", module: "sales", label: "Invoices", description: "Tax invoices, GST, e-invoice and e-way bill." },
  { key: "sales.challans", module: "sales", label: "Challans & dispatch", description: "Delivery challans, vehicles and proof of delivery." },
  { key: "sales.returns", module: "sales", label: "Returns & credit notes", description: "Sales returns and the credit notes they raise." },
  // purchase
  { key: "purchase.orders", module: "purchase", label: "Purchase orders", description: "Orders to suppliers and brands." },
  { key: "purchase.grn", module: "purchase", label: "Goods receipts (GRN)", description: "Receiving goods with batch, shade and landed cost." },
  { key: "purchase.invoices", module: "purchase", label: "Purchase invoices", description: "Supplier bills." },
  { key: "purchase.debitnotes", module: "purchase", label: "Debit notes", description: "Returns of goods to suppliers." },
  { key: "purchase.schemes", module: "purchase", label: "Brand schemes", description: "Supplier incentive schemes and their progress." },
  { key: "purchase.claims", module: "purchase", label: "Breakage claims", description: "Claims on suppliers for damaged goods." },
  // inventory
  { key: "inventory.stock", module: "inventory", label: "Stock & ledger", description: "Stock by shade and godown, the stock ledger, low and dead stock, lot finder, analysis and reorder." },
  { key: "inventory.transfers", module: "inventory", label: "Transfers", description: "Stock moves between godowns and branches." },
  { key: "inventory.adjustments", module: "inventory", label: "Adjustments", description: "Stock corrections with approval." },
  { key: "inventory.counts", module: "inventory", label: "Stock counts", description: "Physical counts against the system." },
  { key: "inventory.breakage", module: "inventory", label: "Breakage", description: "Damaged stock and write-offs." },
  { key: "inventory.samples", module: "inventory", label: "Samples & display", description: "Samples out and display boards." },
  { key: "inventory.labels", module: "inventory", label: "Labels & scan", description: "Barcode labels and scanning." },
  // accounts
  { key: "accounts.receipts", module: "accounts", label: "Receipts", description: "Money in, matched to invoices." },
  { key: "accounts.payments", module: "accounts", label: "Payments", description: "Money out to suppliers." },
  { key: "accounts.outstanding", module: "accounts", label: "Outstanding & statements", description: "Who owes what, ageing and party statements." },
  { key: "accounts.cheques", module: "accounts", label: "Cheque register", description: "Cheques from received to cleared or bounced." },
  // crm
  { key: "crm.leads", module: "crm", label: "Leads", description: "Enquiries and their stages." },
  { key: "crm.followups", module: "crm", label: "Follow-ups", description: "Reminders and their outcomes." },
  { key: "crm.visits", module: "crm", label: "Site visits", description: "Visits logged by the field team." },
  { key: "crm.influencers", module: "crm", label: "Influencers", description: "Architects, contractors and their payouts." },
  // office
  { key: "office.employees", module: "office", label: "Employees", description: "Employee records." },
  { key: "office.attendance", module: "office", label: "Attendance", description: "The QR screen, check-in and check-out." },
] as const;

export type FeaturePartKey = (typeof FEATURE_PARTS)[number]["key"];
export const FEATURE_PART_KEYS = FEATURE_PARTS.map((p) => p.key) as FeaturePartKey[];
export type AnyFeatureKey = FeatureKey | FeaturePartKey;
export const ALL_FEATURE_KEYS = [...FEATURE_KEYS, ...FEATURE_PART_KEYS] as AnyFeatureKey[];

/** The saved switches. A part's own value is kept even while its module is off, so it comes back as it was. */
export type FeatureFlags = Record<AnyFeatureKey, boolean>;

const PART_MODULE = Object.fromEntries(FEATURE_PARTS.map((p) => [p.key, p.module])) as Record<FeaturePartKey, FeatureKey>;

/** Is this really on? A part is on only when its own switch and its module's switch are both on. */
export function featureOn(flags: Partial<Record<AnyFeatureKey, boolean>>, key: AnyFeatureKey): boolean {
  if (flags[key] === false) return false;
  const module = moduleOf(key);
  return !module || flags[module] !== false;
}

/** The module a part belongs to; a module has none. */
export function moduleOf(key: AnyFeatureKey): FeatureKey | undefined {
  return (PART_MODULE as Record<string, FeatureKey | undefined>)[key];
}

export function featureLabel(key: AnyFeatureKey): string {
  return FEATURE_PARTS.find((p) => p.key === key)?.label ?? FEATURES.find((f) => f.key === key)?.label ?? key;
}

/** The first path segment of an API route (after /api) and the module or part it belongs to. Anything not listed is always on. */
export const ROUTE_FEATURE: Record<string, AnyFeatureKey> = {
  // sales
  quotations: "sales.quotations",
  "sales-orders": "sales.orders",
  invoices: "sales.invoices",
  gst: "sales.invoices",
  challans: "sales.challans",
  dispatches: "sales.challans",
  "sales-returns": "sales.returns",
  "credit-notes": "sales.returns",
  sales: "sales",
  credit: "sales",
  // purchase
  "purchase-orders": "purchase.orders",
  grns: "purchase.grn",
  "purchase-invoices": "purchase.invoices",
  "debit-notes": "purchase.debitnotes",
  schemes: "purchase.schemes",
  "breakage-claims": "purchase.claims",
  // inventory
  stock: "inventory.stock",
  batches: "inventory.stock",
  samples: "inventory.samples",
  "display-boards": "inventory.samples",
  labels: "inventory.labels",
  scan: "inventory.labels",
  // accounts
  receipts: "accounts.receipts",
  payments: "accounts.payments",
  outstanding: "accounts.outstanding",
  statements: "accounts.outstanding",
  cheques: "accounts.cheques",
  // crm
  leads: "crm.leads",
  followups: "crm.followups",
  "site-visits": "crm.visits",
  influencers: "crm.influencers",
  "influencer-payouts": "crm.influencers",
  crm: "crm",
  // reports
  reports: "reports",
  // office
  employees: "office.employees",
  attendance: "office.attendance",
  // tally
  tally: "tally",
};

/**
 * Routes whose first segment says one thing but whose action belongs to another part: creating an invoice from an
 * order is "invoices", turning a quotation into an order is "orders". Checked before ROUTE_FEATURE. The module
 * switch still applies on top (see featureOn).
 */
const ROUTE_RULES: [RegExp, AnyFeatureKey][] = [
  [/^sales-orders\/[^/]+\/invoice/, "sales.invoices"],
  [/^quotations\/[^/]+\/convert/, "sales.orders"],
  [/^leads\/[^/]+\/convert/, "sales.quotations"],
  [/^stock\/transfers/, "inventory.transfers"],
  [/^stock\/adjustments/, "inventory.adjustments"],
  [/^stock\/counts/, "inventory.counts"],
  [/^stock\/breakage/, "inventory.breakage"],
];

/** The switch an API path (after /api/) is behind, or undefined when it is always available. */
export function featureForRoute(path: string): AnyFeatureKey | undefined {
  const p = path.replace(/^\/?(api\/)?/, "");
  for (const [re, key] of ROUTE_RULES) if (re.test(p)) return key;
  return ROUTE_FEATURE[p.split("/")[0]];
}

/** Web page address prefixes and their switch; the longest matching prefix wins. */
const PAGE_FEATURE: [string, AnyFeatureKey][] = [
  ["/sales/quotations", "sales.quotations"],
  ["/sales/orders", "sales.orders"],
  ["/sales/invoices", "sales.invoices"],
  ["/sales/challans", "sales.challans"],
  ["/sales/returns", "sales.returns"],
  ["/sales", "sales"],
  ["/purchase/orders", "purchase.orders"],
  ["/purchase/grn", "purchase.grn"],
  ["/purchase/invoices", "purchase.invoices"],
  ["/purchase/debit-notes", "purchase.debitnotes"],
  ["/purchase/schemes", "purchase.schemes"],
  ["/purchase/claims", "purchase.claims"],
  ["/purchase", "purchase"],
  ["/inventory/transfers", "inventory.transfers"],
  ["/inventory/adjustments", "inventory.adjustments"],
  ["/inventory/counts", "inventory.counts"],
  ["/inventory/breakage", "inventory.breakage"],
  ["/inventory/samples", "inventory.samples"],
  ["/inventory/display", "inventory.samples"],
  ["/inventory/labels", "inventory.labels"],
  ["/inventory/scan", "inventory.labels"],
  ["/inventory", "inventory.stock"],
  ["/accounts/receipts", "accounts.receipts"],
  ["/accounts/payments", "accounts.payments"],
  ["/accounts/outstanding", "accounts.outstanding"],
  ["/accounts/statement", "accounts.outstanding"],
  ["/accounts/cheques", "accounts.cheques"],
  ["/accounts", "accounts"],
  ["/crm/leads", "crm.leads"],
  ["/crm/followups", "crm.followups"],
  ["/crm/visits", "crm.visits"],
  ["/crm/influencers", "crm.influencers"],
  ["/crm", "crm"],
  ["/office/employees", "office.employees"],
  ["/office/attendance", "office.attendance"],
  ["/office", "office"],
  ["/reports", "reports"],
  ["/settings/tally", "tally"],
];

/** The switch a web page address is behind, or undefined when the page is always available. */
export function featureForPage(href: string): AnyFeatureKey | undefined {
  let best: [string, AnyFeatureKey] | undefined;
  for (const e of PAGE_FEATURE) if ((href === e[0] || href.startsWith(e[0] + "/")) && (!best || e[0].length > best[0].length)) best = e;
  return best?.[1];
}
