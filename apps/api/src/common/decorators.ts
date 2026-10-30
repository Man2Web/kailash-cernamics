import { createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common";
import type { PermissionCode } from "@gc/shared";
import type { AuthUser } from "./context";
import { ctx } from "./context";

export const IS_PUBLIC = "isPublic";
/** Route needs no login (health, login, refresh, Tally agent endpoints use their own key). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const PERMS = "perms";
/** Require ALL listed permissions. Checked by PermissionsGuard in the API (never only in the UI). */
export const Perm = (...codes: PermissionCode[]) => SetMetadata(PERMS, codes);

export const SKIP_IDEMPOTENCY = "skipIdempotency";
/** Opt a write endpoint out of the Idempotency-Key requirement (auth endpoints only). */
export const SkipIdempotency = () => SetMetadata(SKIP_IDEMPOTENCY, true);

export const CurrentUser = createParamDecorator((_: unknown, context: ExecutionContext): AuthUser => {
  return context.switchToHttp().getRequest().user;
});

/** Active branch from the X-Branch-Id header (validated against the user's branch access). */
export const BranchId = createParamDecorator((_: unknown, context: ExecutionContext): string => {
  const req = context.switchToHttp().getRequest();
  return req.branchId ?? ctx().branchId;
});
