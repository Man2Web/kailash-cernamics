// Permission codes checked by the API (@Perm decorator) and used by the UI to hide actions.
// The API is the source of truth; hiding in the UI is only convenience.

export const PERMISSIONS = {
  // Settings / org
  "org.read": "View branches, godowns and settings",
  "org.write": "Manage company, branches, godowns, racks and settings",
  "user.read": "View users and roles",
  "user.write": "Manage users, roles and permissions",
  "audit.read": "View audit log and login history",
  // Catalogue
  "catalogue.read": "View products and masters",
  "catalogue.write": "Create and edit products and masters",
  "price.read": "View price lists",
  "price.write": "Manage price lists",
  "cost.read": "See cost price, landed cost and margin",
  // Parties
  "party.read": "View customers, suppliers and influencers",
  "party.write": "Manage customers, suppliers and influencers",
  // Inventory
  "stock.read": "View stock, batches and ledger",
  "stock.transfer": "Create stock transfers and display moves",
  "stock.adjust": "Create stock adjustments",
  "stock.breakage": "Record breakage",
  "stock.count": "Run physical stock counts",
  "sample.write": "Issue and receive back samples, manage display boards",
  "claim.write": "Raise and settle supplier breakage claims",
  // Purchase
  "purchase.read": "View purchase orders, GRNs and purchase invoices",
  "purchase.write": "Create purchase orders, GRNs, purchase invoices and debit notes",
  "scheme.write": "Manage brand schemes and claims",
  // Sales
  "sales.read": "View quotations, orders, invoices and challans",
  "quotation.write": "Create and edit quotations",
  "order.write": "Create sales orders",
  "invoice.write": "Create and post invoices",
  "invoice.cancel": "Cancel posted invoices",
  "dispatch.write": "Create challans and dispatches",
  "return.write": "Create sales returns and credit notes",
  // Accounts
  "accounts.read": "View receipts, payments and outstanding",
  "receipt.write": "Record receipts",
  "payment.write": "Record supplier payments",
  // Approvals
  "approval.discount": "Approve discounts above role limit",
  "approval.credit": "Approve orders on credit hold",
  "approval.stock": "Approve stock adjustments and write-offs",
  // CRM
  "crm.read": "View leads, follow-ups and site visits",
  "crm.write": "Manage leads, follow-ups and site visits",
  // Reports / dashboard
  "dashboard.owner": "Super Admin dashboard",
  "report.read": "View reports",
  // Office: employees and attendance
  "employee.read": "View employees",
  "employee.write": "Create and edit employees",
  "attendance.read": "View attendance records and reports",
  "attendance.manage": "Correct attendance records and export reports",
  // Tally
  "tally.read": "View Tally sync status",
  "tally.write": "Manage Tally agents and retry sync",
} as const;

export type PermissionCode = keyof typeof PERMISSIONS;
export const PERMISSION_CODES = Object.keys(PERMISSIONS) as PermissionCode[];

export function permissionModule(code: string): string {
  return code.split(".")[0];
}

const ALL = PERMISSION_CODES;
const READS = ALL.filter((c) => c.endsWith(".read") && c !== "cost.read" && c !== "audit.read" && c !== "employee.read" && c !== "attendance.read" && c !== "tally.read");

/** Default roles and their permissions; the role matrix UI can change these later. */
export const DEFAULT_ROLES: { code: string; name: string; discountLimitPct: number; permissions: PermissionCode[] }[] = [
  { code: "OWNER", name: "Super Admin", discountLimitPct: 100, permissions: ALL },
  {
    code: "BRANCH_MANAGER",
    name: "Branch manager",
    discountLimitPct: 15,
    // Tally stays with the Super Admin unless they choose to give it to a person.
    permissions: ALL.filter((c) => !["user.write", "org.write", "tally.read", "tally.write"].includes(c)),
  },
  {
    code: "SALES",
    name: "Sales counter",
    discountLimitPct: 5,
    permissions: [
      ...READS.filter((c) => !["accounts.read", "tally.read", "purchase.read", "user.read", "org.read"].includes(c)),
      "org.read",
      "quotation.write",
      "order.write",
      "invoice.write",
      "dispatch.write",
      "crm.write",
      "party.write",
      "sample.write",
    ],
  },
  {
    code: "ACCOUNTS",
    name: "Accounts",
    discountLimitPct: 0,
    permissions: [...READS, "receipt.write", "payment.write", "invoice.cancel", "approval.credit", "cost.read", "purchase.write"],
  },
  {
    code: "GODOWN",
    name: "Godown staff",
    discountLimitPct: 0,
    permissions: ["org.read", "catalogue.read", "stock.read", "stock.transfer", "stock.breakage", "stock.count", "sample.write", "purchase.read", "purchase.write", "sales.read", "dispatch.write", "party.read"],
  },
  // Dedicated login for the shared attendance QR screen: no permissions, can only open /attendance.
  { code: "ATTENDANCE_DISPLAY", name: "Attendance QR screen", discountLimitPct: 0, permissions: [] },
];
