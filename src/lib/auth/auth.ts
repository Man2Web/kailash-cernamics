import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { db } from "@/lib/db/db";
import { CUSTOM_ACCESS_PREFIX, effectivePermissions } from "@/lib/auth/permissions";

const SESSION_COOKIE_NAME = "sixorbit_session_token";

export interface UserSession {
  user: {
    id: string;
    email: string;
    name: string;
    phone?: string;
    employeeNo?: string;
    warehouseId?: string;
    warehouseName?: string;
    status: string;
    roles: string[];
    permissions: string[];
  };
  sessionId: string;
}

// 1. Password Hashing
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// 2. Session Management
// Session policy: multi-device logins are allowed, capped at MAX_SESSIONS_PER_USER (oldest are evicted).
// Expired sessions for the user are purged at every login; a fresh token is issued on every login
// (rotation), so a pre-login token is never promoted to an authenticated one.
const MAX_SESSIONS_PER_USER = 5;

export async function createSession(userId: string): Promise<string> {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // Housekeeping: drop this user's expired sessions and evict the oldest beyond the cap
  try {
    await db.session.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } });
    const active = await db.session.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
    const evict = active.slice(MAX_SESSIONS_PER_USER - 1).map((s: any) => s.id);
    if (evict.length > 0) await db.session.deleteMany({ where: { id: { in: evict } } });
  } catch (error) {
    console.error("Session housekeeping failed:", error instanceof Error ? error.message : "unknown");
  }

  // Save to DB
  await db.session.create({
    data: {
      userId,
      token,
      expiresAt,
    },
  });

  // Set HTTP-Only Cookie
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });

  return token;
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    // Delete from DB
    await db.session.deleteMany({
      where: { token },
    });
  }

  // Clear Cookie
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: new Date(0),
    path: "/",
  });
}

// Get Active Session
export async function getSession(): Promise<UserSession | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!token) return null;

    // Look up session in DB with user and roles
    const dbSession = await db.session.findUnique({
      where: { token },
      include: {
        user: {
          include: {
            userRoles: {
              include: {
                role: {
                  include: {
                    rolePermissions: {
                      include: {
                        permission: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!dbSession || dbSession.expiresAt < new Date()) {
      // Session expired or not found
      return null;
    }

    // Deactivated, locked or deleted users must not keep working sessions
    if (!dbSession.user || dbSession.user.status !== "ACTIVE" || dbSession.user.deletedAt) {
      return null;
    }

    // Extract roles and permissions
    const roles: string[] = [];
    const permissionsSet = new Set<string>();
    // Permissions a Super Admin chose individually for this member live on a hidden per-member role.
    let customCodes: string[] | null = null;

    if (dbSession.user && Array.isArray(dbSession.user.userRoles)) {
      dbSession.user.userRoles.forEach((ur: any) => {
        const roleName: string | undefined = ur?.role?.name;
        const isCustomRole = !!roleName && roleName.startsWith(CUSTOM_ACCESS_PREFIX);
        if (roleName && !isCustomRole) {
          roles.push(roleName);
        }
        if (isCustomRole) customCodes = customCodes || [];
        if (ur?.role?.rolePermissions && Array.isArray(ur.role.rolePermissions)) {
          ur.role.rolePermissions.forEach((rp: any) => {
            const code = rp?.permission?.code;
            if (!code) return;
            if (isCustomRole) (customCodes as string[]).push(code);
            else permissionsSet.add(code);
          });
        }
      });
    }

    // Effective permissions: Super Admin = all, individually chosen = exactly those, otherwise the role presets.
    for (const code of effectivePermissions(roles, customCodes)) permissionsSet.add(code);

    // Fetch employee details to attach phone, employeeNo, and assigned warehouse
    let phone = "";
    let employeeNo = "";
    let warehouseId = "";
    let warehouseName = "";

    try {
      const employee = await db.employee.findFirst({
        where: { email: dbSession.user.email },
      });
      if (employee) {
        phone = employee.phone || "";
        employeeNo = employee.employeeNo || "";
        if (employee.department && employee.department.startsWith("WH-")) {
          warehouseId = employee.department.replace("WH-", "");
        }
      }
    } catch {
      // Silently fall back
    }

    if (warehouseId) {
      try {
        const wh = await db.warehouse.findUnique({ where: { id: warehouseId } });
        if (wh) warehouseName = wh.name;
      } catch {
        // Silently fall back
      }
    }

    return {
      user: {
        id: dbSession.user.id,
        email: dbSession.user.email,
        name: dbSession.user.name,
        phone,
        employeeNo,
        warehouseId,
        warehouseName,
        status: dbSession.user.status,
        roles,
        permissions: Array.from(permissionsSet),
      },
      sessionId: dbSession.id,
    };
  } catch (error) {
    console.error("Error in getSession:", error);
    return null;
  }
}

// 3. RBAC Role & Permission Checks
export function isSuperAdmin(roles: string[]): boolean {
  return roles.includes("SUPER_ADMIN") || roles.includes("ADMIN");
}

export function isSalesPerson(roles: string[]): boolean {
  return roles.some((r) => ["SUPER_ADMIN", "ADMIN", "SALES_PERSON", "SALES_MANAGER", "SALES_STAFF"].includes(r));
}

/** True when the member holds a permission (Super Admins hold all of them). */
export function sessionCan(session: UserSession | null | undefined, code: string): boolean {
  if (!session) return false;
  return isSuperAdmin(session.user.roles) || session.user.permissions.includes(code);
}

export const NO_WAREHOUSE = "00000000-0000-0000-0000-000000000000"; // valid UUID that matches no warehouse

/** True for warehouse-restricted members (warehouse manager / inventory staff who are not admins). */
export function isWarehouseRestricted(session: UserSession | null | undefined): boolean {
  if (!session) return false;
  const roles = session.user.roles;
  if (isSuperAdmin(roles)) return false;
  return roles.includes("WAREHOUSE_MANAGER") || roles.includes("INVENTORY_STAFF");
}

/**
 * The single warehouse a restricted member may see, or undefined when unrestricted.
 * Fails closed: a restricted member with no active assigned warehouse gets a sentinel id that matches nothing.
 */
export function warehouseScopeId(session: UserSession | null | undefined): string | undefined {
  if (!session || !isWarehouseRestricted(session)) return undefined;
  const { warehouseId, warehouseName } = session.user;
  return warehouseId && warehouseName ? warehouseId : NO_WAREHOUSE;
}

/** Server-side check that the member may act on a warehouse. Returns an error message or null. */
export function warehouseAccessError(session: UserSession | null | undefined, warehouseId?: string | null): string | null {
  const scope = warehouseScopeId(session);
  if (scope === undefined) return null;
  if (scope === NO_WAREHOUSE) return "You have not been assigned to an active warehouse. Ask a Super Admin to assign one.";
  if (!warehouseId || warehouseId !== scope) return "You can only work with your assigned warehouse.";
  return null;
}

/** Server-action guard: returns an error object unless the signed-in member holds the permission. */
export async function denyUnlessCan(code: string): Promise<{ error: string } | null> {
  const session = await getSession();
  if (!session) return { error: "Authentication required. Please log in." };
  if (!sessionCan(session, code)) {
    return { error: "Unauthorized: you do not have permission to do this. Ask a Super Admin to grant access." };
  }
  return null;
}

export function canManageAttendance(session: UserSession | null | undefined): boolean {
  return sessionCan(session, "attendance:manage");
}

export function isWarehouseManager(roles: string[]): boolean {
  return roles.some((r) => ["SUPER_ADMIN", "ADMIN", "WAREHOUSE_MANAGER", "INVENTORY_STAFF"].includes(r));
}

export async function hasPermission(permissionCode: string): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;

  // SUPER_ADMIN role bypasses all permission checks
  if (session.user.roles.includes("SUPER_ADMIN")) return true;

  return session.user.permissions.includes(permissionCode);
}

export async function requirePermission(permissionCode: string): Promise<UserSession> {
  const session = await getSession();
  if (!session) {
    throw new Error("UNAUTHENTICATED");
  }

  // SUPER_ADMIN role bypasses all permission checks
  if (session.user.roles.includes("SUPER_ADMIN")) {
    return session;
  }

  if (!session.user.permissions.includes(permissionCode)) {
    throw new Error("UNAUTHORIZED");
  }

  return session;
}

/**
 * Guard for server actions / route handlers. Returns the validated session, or null when the
 * caller is unauthenticated (or, when `adminOnly` is set, not an admin).
 */
export async function authorize(options: { adminOnly?: boolean; permission?: string } = {}): Promise<UserSession | null> {
  const session = await getSession();
  if (!session) return null;
  if (options.adminOnly && !isSuperAdmin(session.user.roles)) return null;
  if (
    options.permission &&
    !session.user.roles.includes("SUPER_ADMIN") &&
    !session.user.permissions.includes(options.permission)
  ) {
    return null;
  }
  return session;
}

/** Invalidate every session of a user (use after password change/reset or account deactivation). */
export async function invalidateUserSessions(userId: string): Promise<void> {
  await db.session.deleteMany({ where: { userId } });
}

/** Delete all expired sessions (called by the scheduled cleanup route). Returns nothing sensitive. */
export async function purgeExpiredSessions(): Promise<void> {
  await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}
