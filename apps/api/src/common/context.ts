import { AsyncLocalStorage } from "node:async_hooks";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roleId: string;
  roleCode: string;
  discountLimitPct: number;
  permissions: Set<string>;
  branchIds: string[];
  defaultBranchId: string | null;
}

export interface RequestStore {
  user?: AuthUser;
  branchId?: string;
  ip?: string;
  agentId?: string;
}

/** Per-request context (user, branch, ip) so services and the audit log don't need it passed in. */
export const requestContext = new AsyncLocalStorage<RequestStore>();

export function ctx(): RequestStore {
  return requestContext.getStore() ?? {};
}

export function currentUserId(): string | null {
  return ctx().user?.id ?? null;
}

/** createdBy/updatedBy for a new row. */
export function stampCreate() {
  const id = currentUserId();
  return { createdBy: id, updatedBy: id };
}

export function stampUpdate() {
  return { updatedBy: currentUserId() };
}
