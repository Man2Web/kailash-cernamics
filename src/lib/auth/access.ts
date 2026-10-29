// Shared (client + server) definitions of the access a Super Admin can give a member.
// Access is role based: a user can hold several roles at once, and every role adds to what the member can open.

export type AssignableRole = "SUPER_ADMIN" | "SALES_PERSON" | "WAREHOUSE_MANAGER" | "ATTENDANCE_MANAGER" | "ATTENDANCE_DISPLAY";

/** The member's main job. Chosen when the user is created. */
export const PRIMARY_ROLE_OPTIONS: Array<{ value: AssignableRole; label: string; help: string }> = [
  { value: "SALES_PERSON", label: "Sales Person", help: "Sales orders, stock availability, daily movement" },
  { value: "WAREHOUSE_MANAGER", label: "Warehouse Manager", help: "Warehouse stock, purchase deliveries, dispatch" },
  { value: "SUPER_ADMIN", label: "Super Admin", help: "Everything, including users, office and attendance" },
  {
    value: "ATTENDANCE_DISPLAY",
    label: "Attendance QR Screen",
    help: "Dedicated login that only shows the office attendance QR. Cannot open anything else.",
  },
];

/** Extra access the Super Admin may add on top of the main role. */
export const EXTRA_ACCESS_OPTIONS: Array<{ value: AssignableRole; label: string; help: string }> = [
  { value: "SALES_PERSON", label: "Sales Person", help: "Sales orders, stock availability, daily movement" },
  { value: "WAREHOUSE_MANAGER", label: "Warehouse Manager", help: "Warehouse stock, purchase deliveries, dispatch (needs an assigned warehouse)" },
  { value: "ATTENDANCE_MANAGER", label: "Attendance Manager", help: "Employee attendance: QR code, manual entry, monthly reports" },
];

const ASSIGNABLE = new Set<string>(["SUPER_ADMIN", "SALES_PERSON", "WAREHOUSE_MANAGER", "ATTENDANCE_MANAGER", "ATTENDANCE_DISPLAY"]);

export function isAssignableRole(value: string): value is AssignableRole {
  return ASSIGNABLE.has(value);
}

export function roleLabel(role: string): string {
  return role.replace(/_/g, " ");
}

/** Maps any stored role name (including legacy ones) onto the roles a Super Admin can assign. */
export function toAssignableRole(role: string | null | undefined): AssignableRole | null {
  const r = (role || "").trim().toUpperCase().replace(/\s+/g, "_");
  if (r === "SUPER_ADMIN" || r === "ADMIN") return "SUPER_ADMIN";
  if (r === "WAREHOUSE_MANAGER" || r === "INVENTORY_STAFF") return "WAREHOUSE_MANAGER";
  if (r === "SALES_PERSON" || r === "SALES_MANAGER" || r === "SALES_STAFF") return "SALES_PERSON";
  if (r === "ATTENDANCE_MANAGER") return "ATTENDANCE_MANAGER";
  if (r === "ATTENDANCE_DISPLAY") return "ATTENDANCE_DISPLAY";
  return null;
}

const PRIORITY: AssignableRole[] = ["SUPER_ADMIN", "WAREHOUSE_MANAGER", "SALES_PERSON", "ATTENDANCE_MANAGER", "ATTENDANCE_DISPLAY"];

/**
 * Splits a member's stored roles into their main role plus extra access.
 * `preferredPrimary` (the main role remembered when the member was set up) wins when the member still holds it.
 */
export function splitRoles(roles: string[], preferredPrimary?: string): { primary: AssignableRole; extras: AssignableRole[] } {
  const present = new Set<AssignableRole>();
  for (const r of roles) {
    const a = toAssignableRole(r);
    if (a) present.add(a);
  }
  const preferred = toAssignableRole(preferredPrimary);
  const primary: AssignableRole =
    preferred && present.has(preferred) ? preferred : PRIORITY.find((p) => present.has(p)) || "SALES_PERSON";
  const extras = primary === "SUPER_ADMIN" ? [] : PRIORITY.filter((p) => p !== primary && p !== "SUPER_ADMIN" && present.has(p));
  return { primary, extras };
}
