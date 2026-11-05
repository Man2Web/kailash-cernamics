import {
  BarChart3,
  Bell,
  Boxes,
  Building2,
  CheckCheck,
  ClipboardCheck,
  ClipboardList,
  Contact,
  FileText,
  Footprints,
  Gauge,
  Gift,
  HandCoins,
  History,
  Images,
  LayoutGrid,
  ListChecks,
  type LucideIcon,
  MapPin,
  Package,
  PackageCheck,
  PackageMinus,
  PackageX,
  Palette,
  Phone,
  QrCode,
  Receipt,
  ReceiptIndianRupee,
  RefreshCcw,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Store,
  Tags,
  ToggleRight,
  Truck,
  Undo2,
  Upload,
  UserCog,
  Users,
  Wallet,
  Warehouse,
} from "lucide-react";
import { type AnyFeatureKey, featureForPage, type PermissionCode } from "@gc/shared";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  perm?: PermissionCode;
  /** Only the Super Admin sees this entry. */
  ownerOnly?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Main navigation (docs/ui-guidelines.md). Items the user lacks permission for are hidden. */
export const navGroups: NavGroup[] = [
  {
    label: "",
    items: [
      { href: "/", label: "Dashboard", icon: Gauge },
      { href: "/approvals", label: "Approvals", icon: CheckCheck },
      { href: "/notifications", label: "Notifications", icon: Bell },
    ],
  },
  {
    label: "CRM",
    items: [
      { href: "/crm/leads", label: "Leads", icon: Phone, perm: "crm.read" },
      { href: "/crm/followups", label: "Follow-ups", icon: ListChecks, perm: "crm.read" },
      { href: "/crm/visits", label: "Site visits", icon: MapPin, perm: "crm.read" },
      { href: "/crm/influencers", label: "Influencers", icon: Footprints, perm: "party.read" },
    ],
  },
  {
    label: "Sales",
    items: [
      { href: "/sales/quotations", label: "Quotations", icon: FileText, perm: "sales.read" },
      { href: "/sales/orders", label: "Sales orders", icon: ClipboardList, perm: "sales.read" },
      { href: "/sales/invoices", label: "Invoices", icon: Receipt, perm: "sales.read" },
      { href: "/sales/challans", label: "Challans & dispatch", icon: Truck, perm: "sales.read" },
      { href: "/sales/returns", label: "Returns & credit notes", icon: Undo2, perm: "sales.read" },
      { href: "/parties/customers", label: "Customers", icon: Users, perm: "party.read" },
    ],
  },
  {
    label: "Purchase",
    items: [
      { href: "/purchase/orders", label: "Purchase orders", icon: ShoppingCart, perm: "purchase.read" },
      { href: "/purchase/grn", label: "Goods receipt (GRN)", icon: PackageCheck, perm: "purchase.read" },
      { href: "/purchase/invoices", label: "Purchase invoices", icon: ScrollText, perm: "purchase.read" },
      { href: "/purchase/debit-notes", label: "Debit notes", icon: PackageMinus, perm: "purchase.read" },
      { href: "/purchase/schemes", label: "Brand schemes", icon: Tags, perm: "purchase.read" },
      { href: "/purchase/claims", label: "Breakage claims", icon: PackageX, perm: "purchase.read" },
      { href: "/parties/suppliers", label: "Suppliers", icon: Store, perm: "party.read" },
    ],
  },
  {
    label: "Inventory",
    items: [
      { href: "/inventory/stock", label: "Stock", icon: Boxes, perm: "stock.read" },
      { href: "/inventory/ledger", label: "Stock ledger", icon: History, perm: "stock.read" },
      { href: "/inventory/transfers", label: "Transfers", icon: Warehouse, perm: "stock.read" },
      { href: "/inventory/adjustments", label: "Adjustments", icon: SlidersHorizontal, perm: "stock.read" },
      { href: "/inventory/breakage", label: "Breakage", icon: PackageX, perm: "stock.read" },
      { href: "/inventory/low-stock", label: "Low & dead stock", icon: Package, perm: "stock.read" },
      { href: "/inventory/lot-finder", label: "Shade lot finder", icon: Search, perm: "stock.read" },
      { href: "/inventory/shades", label: "Shade-wise stock", icon: Palette, perm: "stock.read" },
      { href: "/inventory/analysis", label: "Stock analysis", icon: BarChart3, perm: "stock.read" },
      { href: "/inventory/reorder", label: "Reorder planner", icon: ShoppingCart, perm: "purchase.read" },
      { href: "/inventory/counts", label: "Stock counts", icon: ClipboardCheck, perm: "stock.read" },
      { href: "/inventory/labels", label: "Labels & scan", icon: QrCode, perm: "stock.read" },
      { href: "/inventory/samples", label: "Samples out", icon: Gift, perm: "stock.read" },
      { href: "/inventory/display", label: "Display boards", icon: Store, perm: "stock.read" },
    ],
  },
  {
    label: "Office",
    items: [
      { href: "/office/attendance", label: "Attendance", icon: ClipboardCheck, perm: "attendance.read" },
      { href: "/office/employees", label: "Employees", icon: Contact, perm: "employee.read" },
    ],
  },
  {
    label: "Accounts",
    items: [
      { href: "/accounts/receipts", label: "Receipts", icon: ReceiptIndianRupee, perm: "accounts.read" },
      { href: "/accounts/payments", label: "Payments", icon: Wallet, perm: "accounts.read" },
      { href: "/accounts/outstanding", label: "Outstanding", icon: HandCoins, perm: "accounts.read" },
      { href: "/accounts/cheques", label: "Cheque register", icon: ListChecks, perm: "accounts.read" },
    ],
  },
  {
    label: "Catalogue",
    items: [
      { href: "/catalogue/products", label: "Products", icon: LayoutGrid, perm: "catalogue.read" },
      { href: "/catalogue/price-lists", label: "Price lists", icon: Tags, perm: "price.read" },
      { href: "/catalogue/masters", label: "Brands & masters", icon: Package, perm: "catalogue.read" },
      { href: "/catalogue/gallery", label: "Image gallery", icon: Images, perm: "catalogue.read" },
    ],
  },
  {
    label: "Reports",
    items: [{ href: "/reports", label: "Reports", icon: BarChart3, perm: "report.read" }],
  },
  {
    label: "Settings",
    items: [
      { href: "/settings", label: "General", icon: Settings, perm: "org.read" },
      { href: "/settings/branches", label: "Branches & godowns", icon: Building2, perm: "org.read" },
      { href: "/settings/modules", label: "Modules on/off", icon: ToggleRight, ownerOnly: true },
      { href: "/settings/users", label: "Users", icon: UserCog, perm: "user.read" },
      { href: "/settings/roles", label: "Roles & permissions", icon: ShieldCheck, perm: "user.read" },
      { href: "/settings/vehicles", label: "Vehicles", icon: Truck, perm: "org.read" },
      { href: "/settings/import", label: "Import data", icon: Upload, perm: "catalogue.write" },
      { href: "/settings/go-live", label: "Go-live checklist", icon: ListChecks, perm: "org.read" },
      { href: "/settings/tally", label: "Tally sync", icon: RefreshCcw, perm: "tally.read" },
      { href: "/settings/audit", label: "Audit & logins", icon: History, perm: "audit.read" },
    ],
  },
];

/** Which module, or part of a module, a menu entry or page belongs to, by its address. The Super Admin can switch each off. */
export function featureOf(href: string): AnyFeatureKey | undefined {
  return featureForPage(href);
}

/** Shown only if the person may use it and its module is switched on. */
export function navVisible(i: NavItem, can: (...p: PermissionCode[]) => boolean, on: (f: AnyFeatureKey) => boolean, isOwner: boolean): boolean {
  if (i.ownerOnly && !isOwner) return false;
  const f = featureOf(i.href);
  if (f && !on(f)) return false;
  return !i.perm || can(i.perm);
}

export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/settings") return pathname === "/settings";
  return pathname === href || pathname.startsWith(href + "/");
}
