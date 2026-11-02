import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { AuthUser, ctx } from "./context";
import { IS_PUBLIC, PERMS } from "./decorators";

export const ACCESS_COOKIE = "gc_at";
export const REFRESH_COOKIE = "gc_rt";

const cache = new Map<string, { user: AuthUser; at: number }>();
const TTL_MS = 30_000;

export function invalidateUserCache(userId?: string) {
  if (userId) cache.delete(userId);
  else cache.clear();
}

export async function loadAuthUser(prisma: PrismaService, userId: string): Promise<AuthUser | null> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.user;
  const u = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: { include: { permissions: { include: { permission: true } } } }, branches: true },
  });
  if (!u || !u.isActive || u.deletedAt) return null;
  let branchIds = u.branches.map((b) => b.branchId);
  if (u.role.code === "OWNER") {
    branchIds = (await prisma.branch.findMany({ where: { deletedAt: null, isActive: true }, select: { id: true } })).map((b) => b.id);
  }
  const user: AuthUser = {
    id: u.id,
    email: u.email,
    name: u.name,
    roleId: u.roleId,
    roleCode: u.role.code,
    discountLimitPct: u.role.discountLimitPct,
    // The Super Admin can give one person exactly the access they choose instead of the role's defaults.
    permissions: new Set(u.useCustomAccess ? u.customPermissions : u.role.permissions.map((p) => p.permission.code)),
    branchIds,
    defaultBranchId: u.defaultBranchId ?? branchIds[0] ?? null,
  };
  cache.set(userId, { user, at: Date.now() });
  return user;
}

/** Global guard: JWT from the httpOnly cookie (or Bearer header), then permissions and branch access. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser; branchId?: string }>();
    const header = req.headers.authorization;
    const token = req.cookies?.[ACCESS_COOKIE] || (header?.startsWith("Bearer ") ? header.slice(7) : undefined);
    if (!token) throw new UnauthorizedException("Please sign in");
    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(token, { secret: process.env.JWT_ACCESS_SECRET });
    } catch {
      throw new UnauthorizedException("Session expired");
    }
    const user = await loadAuthUser(this.prisma, payload.sub);
    if (!user) throw new UnauthorizedException("Account is disabled");

    const required = this.reflector.getAllAndOverride<string[]>(PERMS, [context.getHandler(), context.getClass()]) ?? [];
    const missing = required.filter((p) => !user.permissions.has(p));
    if (missing.length) throw new ForbiddenException(`You don't have permission (${missing.join(", ")})`);

    const requested = (req.headers["x-branch-id"] as string | undefined) || undefined;
    let branchId = user.defaultBranchId ?? undefined;
    if (requested) {
      if (!user.branchIds.includes(requested)) throw new ForbiddenException("No access to this branch");
      branchId = requested;
    }
    req.user = user;
    req.branchId = branchId;
    const store = ctx();
    store.user = user;
    store.branchId = branchId;
    return true;
  }
}
