// Shared (client + server) catalog of the permissions a Super Admin can give a member.
// Codes follow the "module:action" convention used by the Permission table.

export interface PermissionDef {
  code: string;
  label: string;
  help: string;
  /** Only Super Admins hold these; they can never be handed to another member. */
  superAdminOnly?: boolean;
}

export interface PermissionGroup {
  key: string;
  title: string;
  permissions: PermissionDef[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: "dashboard",
    title: "Dashboard",
    permissions: [{ code: "dashboard:view", label: "View Dashboard", help: "Main overview: stock, orders and delivery summary" }],
  },
  {
    key: "stock",
    title: "Products and Stock",
    permissions: [
      { code: "stock:view", label: "View Stock & Products", help: "Browse products, prices and live stock availability" },
      { code: "products:create", label: "Add Products", help: "Create products with opening stock and QR codes" },
      { code: "products:manage", label: "Manage Categories, Brands & Units", help: "Create and organise product categories, brands and units" },
    ],
  },
  {
    key: "leads",
    title: "Leads and Enquiries",
    permissions: [
      { code: "leads:view", label: "View Leads", help: "See walk-in and phone enquiries and the follow-ups due" },
      { code: "leads:create", label: "Record Enquiries", help: "Add walk-in and phone-call enquiries" },
      { code: "leads:update", label: "Update Leads", help: "Change a lead's status, follow-up date and salesperson" },
    ],
  },
  {
    key: "sales",
    title: "Sales and Customers",
    permissions: [
      { code: "sales:view", label: "View Sales Orders", help: "See sales orders, reservations and their history" },
      { code: "sales:create", label: "Create Sales Orders", help: "Create orders and reserve stock for customers" },
      { code: "sales:status", label: "Update Order Status", help: "Change order status and release stock reservations" },
      { code: "sales:dispatch", label: "Schedule Dispatch", help: "Create deliveries for sales orders" },
      { code: "invoices:create", label: "Create Sales Invoices", help: "Issue GST invoices and update customer balances" },
      { code: "customers:create", label: "Add Customers", help: "Register new customers" },
    ],
  },
  {
    key: "purchase",
    title: "Purchase and Suppliers",
    permissions: [
      { code: "purchase:view", label: "View Purchase Orders", help: "See purchase orders and their delivery status" },
      { code: "purchase:create", label: "Create Purchase Orders", help: "Raise new purchase orders" },
      { code: "purchase:receive", label: "Receive Stock", help: "Update delivery status and receive purchased stock" },
      { code: "suppliers:create", label: "Register Suppliers", help: "Add new suppliers / vendors" },
    ],
  },
  {
    key: "warehouse",
    title: "Warehouse and Movement",
    permissions: [
      { code: "warehouse:view", label: "View My Warehouse", help: "Warehouse stock, relevant orders and deliveries" },
      { code: "warehouse:manage", label: "Manage Warehouse Structure", help: "Create warehouses, locations, racks and bins" },
      { code: "movement:view", label: "View Daily Movement", help: "Track vehicle dispatches and driver status" },
      { code: "movement:update", label: "Update Delivery Status", help: "Move deliveries through dispatch to completion" },
    ],
  },
  {
    key: "attendance",
    title: "Employee Attendance",
    permissions: [
      { code: "attendance:manage", label: "Manage Attendance", help: "Attendance QR code, manual entry and monthly reports" },
    ],
  },
  {
    key: "admin",
    title: "Company and User Administration",
    permissions: [
      { code: "users:manage", label: "Manage User Accounts", help: "Create, deactivate and reset user accounts (Super Admin)", superAdminOnly: true },
      { code: "permissions:assign", label: "Assign Permissions", help: "Change what other members can open and do (Super Admin)", superAdminOnly: true },
    ],
  },
];

export const ALL_PERMISSION_CODES: string[] = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.code));
export const ASSIGNABLE_PERMISSION_CODES: string[] = PERMISSION_GROUPS.flatMap((g) =>
  g.permissions.filter((p) => !p.superAdminOnly).map((p) => p.code)
);

const SALES_PRESET = [
  "dashboard:view",
  "leads:view",
  "leads:create",
  "leads:update",
  "sales:view",
  "sales:create",
  "invoices:create",
  "customers:create",
  "stock:view",
  "movement:view",
];

const WAREHOUSE_PRESET = [
  "dashboard:view",
  "warehouse:view",
  "stock:view",
  "products:create",
  "products:manage",
  "sales:view",
  "sales:status",
  "sales:dispatch",
  "purchase:view",
  "purchase:receive",
  "movement:view",
  "movement:update",
];

/** What each role gives when a member has no individually chosen permissions (and the starting point for the checklist). */
export const ROLE_PRESETS: Record<string, string[]> = {
  SUPER_ADMIN: ALL_PERMISSION_CODES,
  ADMIN: ALL_PERMISSION_CODES,
  SALES_PERSON: SALES_PRESET,
  SALES_MANAGER: SALES_PRESET,
  SALES_STAFF: SALES_PRESET,
  WAREHOUSE_MANAGER: WAREHOUSE_PRESET,
  INVENTORY_STAFF: WAREHOUSE_PRESET,
  ATTENDANCE_MANAGER: ["dashboard:view", "attendance:manage"],
  // The dedicated QR-screen login holds no module permissions at all.
  ATTENDANCE_DISPLAY: [],
};

/** Roles that older accounts hold; they keep the dashboard only, exactly as before. */
const DEFAULT_PRESET = ["dashboard:view"];

export function presetFor(role: string): string[] {
  return ROLE_PRESETS[role] || DEFAULT_PRESET;
}

/** Name prefix of the hidden per-member role that stores individually chosen permissions. */
export const CUSTOM_ACCESS_PREFIX = "CUSTOM_ACCESS:";

export function isSuperAdminRole(roles: string[]): boolean {
  return roles.includes("SUPER_ADMIN") || roles.includes("ADMIN");
}

/**
 * Effective permissions of a member.
 * Super Admin: everything. Individually chosen permissions (when set): exactly those. Otherwise the union of the role presets.
 */
export function effectivePermissions(roles: string[], customCodes: string[] | null): string[] {
  if (isSuperAdminRole(roles)) return ALL_PERMISSION_CODES;
  if (customCodes) return ASSIGNABLE_PERMISSION_CODES.filter((c) => customCodes.includes(c));
  const set = new Set<string>();
  for (const r of roles) for (const c of presetFor(r)) set.add(c);
  return Array.from(set);
}

/** Keeps only known, assignable codes (a Super Admin only permission can never be handed out). */
export function sanitizePermissionCodes(codes: unknown): string[] {
  if (!Array.isArray(codes)) return [];
  const allowed = new Set(ASSIGNABLE_PERMISSION_CODES);
  return Array.from(new Set(codes.filter((c): c is string => typeof c === "string" && allowed.has(c))));
}

export function permissionMeta(code: string): { name: string; module: string } {
  for (const g of PERMISSION_GROUPS) {
    const p = g.permissions.find((x) => x.code === code);
    if (p) return { name: p.label, module: g.key.toUpperCase() };
  }
  return { name: code, module: "OTHER" };
}

/** Where to send a member who may not open the dashboard: the first screen they are allowed to use. */
export function firstAllowedPath(permissions: string[], isSuperAdmin: boolean): string | null {
  const order: Array<[string, string]> = [
    ["dashboard:view", "/dashboard"],
    ["sales:view", "/sales"],
    ["leads:view", "/leads"],
    ["stock:view", "/stock"],
    ["warehouse:view", "/warehouse"],
    ["purchase:view", "/purchase"],
    ["movement:view", "/movement"],
    ["attendance:manage", "/office/attendance"],
  ];
  for (const [code, path] of order) if (isSuperAdmin || permissions.includes(code)) return path;
  return null;
}
