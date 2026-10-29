import db from "@/lib/db/db";
import { splitRoles, toAssignableRole } from "@/lib/auth/access";
import { CUSTOM_ACCESS_PREFIX } from "@/lib/auth/permissions";

function formatDate(value: unknown): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
}

/** Users (with roles, custom permissions, employee details and assigned warehouse) plus the warehouse list. */
export async function loadOfficeUsers() {
  // Fetch Users and Roles
  const users = await db.user.findMany({
    include: {
      userRoles: {
        include: {
          role: { include: { rolePermissions: { include: { permission: true } } } },
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const employees = await db.employee.findMany();
  const employeeMap = new Map<string, any>(employees.map((e: any) => [e.email?.toLowerCase() || "", e]));

  const warehouses = await db.warehouse.findMany({ orderBy: { code: "asc" } });
  const warehouseMap = new Map<string, string>(warehouses.map((w: any) => [w.id, w.name]));

  // Format users
  const formattedUsers = users.map((u: any) => {
    const allUserRoles: any[] = u.userRoles || [];
    // Individually chosen permissions are stored on a hidden per-member role: keep it out of the visible roles.
    const customRole = allUserRoles.find((ur: any) => ur?.role?.name?.startsWith(CUSTOM_ACCESS_PREFIX));
    const customPermissions: string[] | null = customRole
      ? (customRole.role.rolePermissions || []).map((rp: any) => rp?.permission?.code).filter(Boolean)
      : null;
    const allRoles: string[] = allUserRoles
      .map((ur: any) => ur?.role?.name)
      .filter((n: any) => n && !n.startsWith(CUSTOM_ACCESS_PREFIX));
    const emp = employeeMap.get(u.email?.toLowerCase() || "");
    // Main role = the one remembered on the employee record (falls back to the highest-priority role held).
    const { primary } = splitRoles(allRoles, emp?.jobTitle);
    const roleName = allRoles.find((r) => toAssignableRole(r) === primary) || allRoles[0] || "VIEWER";
    let warehouseId = "";
    if (emp?.department && typeof emp.department === "string" && emp.department.startsWith("WH-")) {
      warehouseId = emp.department.replace("WH-", "");
    }
    const warehouseName = warehouseId ? warehouseMap.get(warehouseId) || "" : "";

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      phone: emp?.phone || "",
      employeeNo: emp?.employeeNo || "",
      role: roleName,
      roles: allRoles,
      customPermissions,
      warehouseId,
      warehouseName,
      status: u.status || "ACTIVE",
      createdAt: formatDate(u.createdAt),
    };
  });


  return { users: formattedUsers, warehouses };
}
