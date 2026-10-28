"use server";

import { revalidatePath } from "next/cache";
import db from "@/lib/db/db";
import { hashPassword, getSession, isSuperAdmin, invalidateUserSessions } from "@/lib/auth/auth";
import { isAssignableRole } from "@/lib/auth/access";
import { CUSTOM_ACCESS_PREFIX, permissionMeta, sanitizePermissionCodes } from "@/lib/auth/permissions";

// Finds (or creates) the role record for an assignable access role.
async function ensureRole(tx: any, roleName: string) {
  let roleRec = await tx.role.findFirst({ where: { name: roleName } });
  if (!roleRec && roleName === "SALES_PERSON") {
    roleRec = await tx.role.findFirst({ where: { name: "SALES_STAFF" } });
  }
  if (!roleRec) {
    roleRec = await tx.role.create({
      data: { name: roleName, description: `${roleName.replace(/_/g, " ")} role` },
    });
  }
  return roleRec;
}

// Stores the permissions a Super Admin ticked for one member on a hidden per-member role (replacing any earlier choice).
async function setCustomPermissions(tx: any, userId: string, codes: string[]) {
  const roleName = CUSTOM_ACCESS_PREFIX + userId;
  let role = await tx.role.findFirst({ where: { name: roleName } });
  if (!role) {
    role = await tx.role.create({ data: { name: roleName, description: "Individually chosen permissions" } });
  }
  await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
  for (const code of codes) {
    let perm = await tx.permission.findFirst({ where: { code } });
    if (!perm) {
      const meta = permissionMeta(code);
      perm = await tx.permission.create({ data: { code, name: meta.name, module: meta.module } });
    }
    await tx.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
  }
  const link = await tx.userRole.findFirst({ where: { userId, roleId: role.id } });
  if (!link) await tx.userRole.create({ data: { userId, roleId: role.id } });
}

// Removes individually chosen permissions: the member goes back to what their role gives.
async function clearCustomPermissions(tx: any, userId: string) {
  const role = await tx.role.findFirst({ where: { name: CUSTOM_ACCESS_PREFIX + userId } });
  if (role) await tx.role.delete({ where: { id: role.id } });
}

export interface CreateUserData {
  name: string;
  employeeNo?: string;
  role: "SUPER_ADMIN" | "SALES_PERSON" | "WAREHOUSE_MANAGER";
  /** Permissions ticked by the Super Admin. When omitted the member simply gets what their role gives. */
  permissions?: string[];
  email?: string;
  phone?: string;
  warehouseId?: string;
  password?: string;
  status?: "ACTIVE" | "INACTIVE";
}

export interface UpdateUserData {
  id: string;
  name: string;
  employeeNo?: string;
  role: string;
  email?: string;
  phone?: string;
  warehouseId?: string;
  status?: string;
}

export async function createUserAction(data: CreateUserData) {
  try {
    const session = await getSession();
    if (!session || !isSuperAdmin(session.user.roles)) {
      return { error: "Unauthorized: Super Admin permission required to manage users." };
    }

    // Validations
    if (!data.name || data.name.trim().length === 0) {
      return { error: "Full Name is required." };
    }

    if (!data.role) {
      return { error: "User Role is required." };
    }

    if (!isAssignableRole(data.role)) {
      return { error: "Unknown user role." };
    }
    const customPermissions = data.role !== "SUPER_ADMIN" && Array.isArray(data.permissions) ? sanitizePermissionCodes(data.permissions) : null;
    const hasWarehouseAccess = data.role === "WAREHOUSE_MANAGER";

    if (hasWarehouseAccess && !data.warehouseId) {
      return { error: "Assigned Warehouse is required when creating a Warehouse Manager." };
    }

    const email = data.email?.trim().toLowerCase() || "";
    const phone = data.phone?.trim() || "";

    if (!email && !phone) {
      return { error: "Either Email address or Phone number must be provided." };
    }

    const resolvedEmail = email || `${phone.replace(/\D/g, "")}@inventory.local`;
    const employeeNo = data.employeeNo?.trim() || `EMP-${Date.now().toString().slice(-4)}`;
    const password = data.password?.trim() || "Inventory@123";

    if (password.length < 6) {
      return { error: "Password must be at least 6 characters." };
    }

    // Check duplicate email
    const existingUserByEmail = await db.user.findFirst({
      where: { email: resolvedEmail },
    });
    if (existingUserByEmail) {
      return { error: `User with email ${resolvedEmail} already exists.` };
    }

    // Check duplicate phone
    if (phone) {
      const existingEmployeeByPhone = await db.employee.findFirst({
        where: { phone },
      });
      if (existingEmployeeByPhone) {
        return { error: `An employee with phone number ${phone} already exists.` };
      }
    }

    const passwordHash = await hashPassword(password);

    const result = await db.$transaction(async (tx: any) => {
      // 1. Create User
      const newUser = await tx.user.create({
        data: {
          email: resolvedEmail,
          passwordHash,
          name: data.name.trim(),
          status: data.status || "ACTIVE",
        },
      });

      // 2. Assign the main role, then the individually ticked permissions (if any)
      const roleName: string = data.role;
      const roleRec = await ensureRole(tx, roleName);
      await tx.userRole.create({ data: { userId: newUser.id, roleId: roleRec.id } });
      if (customPermissions) await setCustomPermissions(tx, newUser.id, customPermissions);

      // 3. Create Employee entry for contact and warehouse linking
      await tx.employee.create({
        data: {
          employeeNo,
          name: data.name.trim(),
          email: resolvedEmail,
          phone: phone || null,
          department: hasWarehouseAccess && data.warehouseId ? `WH-${data.warehouseId}` : roleName,
          jobTitle: roleName.replace(/_/g, " "),
          status: data.status || "ACTIVE",
          salary: 0,
        },
      });

      return newUser;
    });

    revalidatePath("/office");
    revalidatePath("/dashboard");
    return { success: true, data: result };
  } catch (error: any) {
    console.error("Error creating user:", error);
    return { error: error.message || "Failed to create user." };
  }
}

export async function updateUserAction(data: UpdateUserData) {
  try {
    const session = await getSession();
    if (!session || !isSuperAdmin(session.user.roles)) {
      return { error: "Unauthorized: Super Admin permission required." };
    }

    const email = data.email?.trim().toLowerCase();
    const phone = data.phone?.trim();

    await db.$transaction(async (tx: any) => {
      // 1. Update user
      const updateData: any = {
        name: data.name.trim(),
        status: data.status || "ACTIVE",
      };
      if (email) updateData.email = email;

      await tx.user.update({
        where: { id: data.id },
        data: updateData,
      });

      // 2. Update employee
      const user = await tx.user.findUnique({ where: { id: data.id } });
      if (user) {
        const emp = await tx.employee.findFirst({ where: { email: user.email } });
        if (emp) {
          await tx.employee.update({
            where: { id: emp.id },
            data: {
              name: data.name.trim(),
              phone: phone || emp.phone,
              department: data.warehouseId ? `WH-${data.warehouseId}` : data.role,
              status: data.status || emp.status,
              jobTitle: data.role.replace(/_/g, " "),
            },
          });
        }
      }

      // 3. Update Role if provided
      if (data.role) {
        let roleRec = await tx.role.findFirst({ where: { name: data.role } });
        if (roleRec) {
          await tx.userRole.deleteMany({ where: { userId: data.id } });
          await tx.userRole.create({
            data: {
              userId: data.id,
              roleId: roleRec.id,
            },
          });
        }
      }
    });

    revalidatePath("/office");
    return { success: true };
  } catch (error: any) {
    console.error("Error updating user:", error);
    return { error: error.message || "Failed to update user." };
  }
}

export interface UpdateUserAccessData {
  userId: string;
  role: string;
  /** Permissions ticked by the Super Admin. When omitted the member goes back to what their role gives. */
  permissions?: string[];
  warehouseId?: string;
}

/** Changes what a member can open and do: their role template plus the permissions ticked. Super Admin only. */
export async function updateUserAccessAction(data: UpdateUserAccessData) {
  try {
    const session = await getSession();
    if (!session || !isSuperAdmin(session.user.roles)) {
      return { error: "Unauthorized: Super Admin permission required." };
    }
    if (!isAssignableRole(data.role)) {
      return { error: "Unknown user role." };
    }

    const customPermissions = data.role !== "SUPER_ADMIN" && Array.isArray(data.permissions) ? sanitizePermissionCodes(data.permissions) : null;
    const hasWarehouseAccess = data.role === "WAREHOUSE_MANAGER";
    if (hasWarehouseAccess && !data.warehouseId) {
      return { error: "Assigned Warehouse is required for a Warehouse Manager." };
    }

    const user = await db.user.findUnique({ where: { id: data.userId } });
    if (!user) return { error: "User not found." };

    // Never leave the system without a Super Admin (and never let someone lock themselves out).
    if (data.role !== "SUPER_ADMIN") {
      if (data.userId === session.user.id) {
        return { error: "You cannot remove your own Super Admin access." };
      }
      const adminRoleFilter = { role: { name: { in: ["SUPER_ADMIN", "ADMIN"] } } };
      const targetAdminRows = await db.userRole.findMany({ where: { userId: data.userId, ...adminRoleFilter } });
      const otherAdminRows = await db.userRole.findMany({ where: { userId: { not: data.userId }, ...adminRoleFilter } });
      if (targetAdminRows.length > 0 && otherAdminRows.length === 0) {
        return { error: "At least one Super Admin must remain." };
      }
    }

    await db.$transaction(async (tx: any) => {
      await clearCustomPermissions(tx, data.userId);
      await tx.userRole.deleteMany({ where: { userId: data.userId } });
      const roleRec = await ensureRole(tx, data.role);
      await tx.userRole.create({ data: { userId: data.userId, roleId: roleRec.id } });
      if (customPermissions) await setCustomPermissions(tx, data.userId, customPermissions);

      const emp = await tx.employee.findFirst({ where: { email: user.email } });
      if (emp) {
        await tx.employee.update({
          where: { id: emp.id },
          data: {
            department: hasWarehouseAccess && data.warehouseId ? `WH-${data.warehouseId}` : data.role,
            jobTitle: data.role.replace(/_/g, " "),
          },
        });
      }
    });

    revalidatePath("/office");
    return { success: true };
  } catch (error: any) {
    console.error("Error updating user access:", error);
    return { error: error.message || "Failed to update access." };
  }
}

export async function toggleUserStatusAction(userId: string, currentStatus: string) {
  try {
    const session = await getSession();
    if (!session || !isSuperAdmin(session.user.roles)) {
      return { error: "Unauthorized: Super Admin permission required." };
    }

    const newStatus = currentStatus === "ACTIVE" ? "INACTIVE" : "ACTIVE";

    await db.user.update({
      where: { id: userId },
      data: { status: newStatus },
    });

    revalidatePath("/office");
    return { success: true, status: newStatus };
  } catch (error: any) {
    console.error("Error toggling user status:", error);
    return { error: error.message || "Failed to toggle status." };
  }
}

export async function resetUserPasswordAction(userId: string, newPassword: string) {
  try {
    const session = await getSession();
    if (!session || !isSuperAdmin(session.user.roles)) {
      return { error: "Unauthorized: Super Admin permission required." };
    }

    if (!newPassword || newPassword.length < 6) {
      return { error: "Password must be at least 6 characters." };
    }

    const passwordHash = await hashPassword(newPassword.trim());

    await db.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    // A password reset must end every existing login of that user
    await invalidateUserSessions(userId);

    return { success: true };
  } catch (error: any) {
    console.error("Error resetting user password:", error);
    return { error: error.message || "Failed to reset password." };
  }
}

export async function createCustomerAction(data: {
  name: string;
  phone?: string;
  altPhone?: string;
  email?: string;
  address: string;
  gstin?: string;
  groupId?: string;
  creditLimit?: number;
}) {
  try {
    const session = await getSession();
    if (!session) return { error: "Unauthenticated" };

    if (!data.name || data.name.trim().length === 0) {
      return { error: "Customer name is required." };
    }

    const code = `CUS-${Date.now().toString().slice(-6)}`;

    const defaultGroup = await db.customerGroup.findFirst();
    const groupId = data.groupId || defaultGroup?.id;

    if (!groupId) {
      return { error: "No customer group found. Please create a customer group first." };
    }

    const result = await db.$transaction(async (tx: any) => {
      const customer = await tx.customer.create({
        data: {
          code,
          name: data.name.trim(),
          phone: data.phone?.trim() || null,
          email: data.email?.trim() || null,
          gstin: data.gstin?.trim() || null,
          groupId,
          creditLimit: data.creditLimit || 0,
        },
      });

      if (data.address) {
        await tx.customerAddress.create({
          data: {
            customerId: customer.id,
            type: "BILLING",
            address: data.address.trim(),
            city: "Vellore",
            state: "Tamil Nadu",
            pincode: "632001",
            isDefault: true,
          },
        });
      }

      return customer;
    });

    revalidatePath("/office");
    revalidatePath("/customer");
    revalidatePath("/sales");
    return { success: true, data: result };
  } catch (error: any) {
    console.error("Error creating customer:", error);
    return { error: error.message || "Failed to create customer." };
  }
}

export async function createSupplierAction(data: {
  name: string;
  phone?: string;
  email?: string;
  gstin?: string;
  address?: string;
}) {
  try {
    const session = await getSession();
    if (!session) return { error: "Unauthenticated" };

    if (!data.name || data.name.trim().length === 0) {
      return { error: "Supplier name is required." };
    }

    const code = `SUP-${Date.now().toString().slice(-6)}`;

    const result = await db.$transaction(async (tx: any) => {
      const vendor = await tx.vendor.create({
        data: {
          code,
          name: data.name.trim(),
          phone: data.phone?.trim() || null,
          email: data.email?.trim() || null,
          gstin: data.gstin?.trim() || null,
        },
      });

      if (data.address) {
        await tx.vendorAddress.create({
          data: {
            vendorId: vendor.id,
            type: "BILLING",
            address: data.address.trim(),
            city: "Vellore",
            state: "Tamil Nadu",
            pincode: "632001",
          },
        });
      }

      return vendor;
    });

    revalidatePath("/office");
    revalidatePath("/purchase");
    return { success: true, data: result };
  } catch (error: any) {
    console.error("Error creating supplier:", error);
    return { error: error.message || "Failed to create supplier." };
  }
}
