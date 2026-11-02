import { ForbiddenException } from "@nestjs/common";
import type { AuthUser } from "./context";

/** Deciding who can see and do what (roles, the permission matrix, per-person access, module switches) belongs to the Super Admin alone. */
export function assertSuperAdmin(me: AuthUser) {
  if (me.roleCode !== "OWNER") throw new ForbiddenException("Only the Super Admin can change who can see and do what.");
}
