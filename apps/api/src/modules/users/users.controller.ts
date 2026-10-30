import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { z } from "zod";
import {
  listQuerySchema,
  PERMISSION_CODES,
  usersCreateSchema,
  usersResetPasswordSchema,
  usersRolePermissionsSchema,
  usersRoleSchema,
  usersUpdateSchema,
} from "@gc/shared";
import { PrismaService, Tx } from "../../prisma/prisma.service";
import { AuditService } from "../../core/audit.service";
import { CurrentUser, Perm } from "../../common/decorators";
import type { AuthUser } from "../../common/context";
import { ZodPipe } from "../../common/zod.pipe";
import { paginate, pickFilters, searchWhere } from "../../common/pagination";
import { stampCreate, stampUpdate } from "../../common/context";
import { invalidateUserCache } from "../../common/guards";
import { hashPassword } from "../../auth/auth.service";

const userSelect = {
  id: true,
  email: true,
  name: true,
  phone: true,
  isActive: true,
  roleId: true,
  defaultBranchId: true,
  lastLoginAt: true,
  totpEnabled: true,
  createdAt: true,
  role: { select: { id: true, code: true, name: true } },
  branches: { select: { branchId: true, branch: { select: { id: true, code: true, name: true } } } },
} as const;

@Controller()
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---- users
  @Get("users")
  @Perm("user.read")
  list(@Query(new ZodPipe(listQuerySchema.extend({ roleId: z.string().optional(), isActive: z.string().optional() }))) q: any) {
    return paginate(this.prisma.user, q, {
      where: { deletedAt: null, ...searchWhere(q.q, ["name", "email", "phone"]), ...pickFilters(q, ["roleId", "isActive"]) },
      select: userSelect,
      orderBy: { name: "asc" },
    });
  }

  @Get("users/:id")
  @Perm("user.read")
  async get(@Param("id") id: string) {
    const u = await this.prisma.user.findFirst({ where: { id, deletedAt: null }, select: userSelect });
    if (!u) throw new NotFoundException();
    return u;
  }

  private async setBranches(tx: Tx, userId: string, branchIds: string[]) {
    await tx.userBranch.deleteMany({ where: { userId } });
    if (branchIds.length) await tx.userBranch.createMany({ data: branchIds.map((branchId) => ({ userId, branchId })), skipDuplicates: true });
  }

  @Post("users")
  @Perm("user.write")
  async create(@Body(new ZodPipe(usersCreateSchema)) body: z.infer<typeof usersCreateSchema>) {
    const { password, branchIds, ...rest } = body;
    const passwordHash = await hashPassword(password);
    return this.prisma.tx(async (tx) => {
      const user = await tx.user.create({
        data: { ...rest, defaultBranchId: rest.defaultBranchId ?? branchIds[0] ?? null, passwordHash, ...stampCreate() },
      });
      await this.setBranches(tx, user.id, branchIds);
      const out = await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: userSelect });
      await this.audit.log({ entity: "user", entityId: user.id, action: "create", after: out }, tx);
      return out;
    });
  }

  @Patch("users/:id")
  @Perm("user.write")
  async update(@Param("id") id: string, @Body(new ZodPipe(usersUpdateSchema)) body: z.infer<typeof usersUpdateSchema>, @CurrentUser() me: AuthUser) {
    const { branchIds, ...rest } = body;
    if (id === me.id && rest.isActive === false) throw new BadRequestException("You cannot deactivate yourself");
    const out = await this.prisma.tx(async (tx) => {
      const before = await tx.user.findFirst({ where: { id, deletedAt: null }, select: userSelect });
      if (!before) throw new NotFoundException();
      await tx.user.update({ where: { id }, data: { ...rest, ...stampUpdate() } });
      if (branchIds) await this.setBranches(tx, id, branchIds);
      const after = await tx.user.findUniqueOrThrow({ where: { id }, select: userSelect });
      await this.audit.log({ entity: "user", entityId: id, action: "update", before, after }, tx);
      if (rest.isActive === false) await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      return after;
    });
    invalidateUserCache(id);
    return out;
  }

  @Post("users/:id/reset-password")
  @Perm("user.write")
  async resetPassword(@Param("id") id: string, @Body(new ZodPipe(usersResetPasswordSchema)) body: { password: string }) {
    const passwordHash = await hashPassword(body.password);
    await this.prisma.tx(async (tx) => {
      const u = await tx.user.findFirst({ where: { id, deletedAt: null } });
      if (!u) throw new NotFoundException();
      await tx.user.update({ where: { id }, data: { passwordHash, ...stampUpdate() } });
      await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.log({ entity: "user", entityId: id, action: "reset_password" }, tx);
    });
    invalidateUserCache(id);
    return { ok: true };
  }

  @Delete("users/:id")
  @Perm("user.write")
  async remove(@Param("id") id: string, @CurrentUser() me: AuthUser) {
    if (id === me.id) throw new BadRequestException("You cannot delete yourself");
    await this.prisma.tx(async (tx) => {
      const before = await tx.user.findFirst({ where: { id, deletedAt: null }, select: userSelect });
      if (!before) throw new NotFoundException();
      await tx.user.update({ where: { id }, data: { deletedAt: new Date(), isActive: false, ...stampUpdate() } });
      await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.log({ entity: "user", entityId: id, action: "delete", before }, tx);
    });
    invalidateUserCache(id);
    return { ok: true };
  }

  // ---- roles & permission matrix
  @Get("permissions")
  @Perm("user.read")
  permissions() {
    return this.prisma.permission.findMany({ orderBy: [{ module: "asc" }, { code: "asc" }] });
  }

  @Get("roles")
  @Perm("user.read")
  async roles(@Query(new ZodPipe(listQuerySchema)) q: any) {
    const page = await paginate<any>(this.prisma.role, { ...q, pageSize: q.pageSize ?? 100 }, {
      where: { deletedAt: null, ...searchWhere(q.q, ["name", "code"]) },
      include: { permissions: { include: { permission: { select: { code: true } } } }, _count: { select: { users: true } } } as any,
      orderBy: { name: "asc" },
    });
    page.items = page.items.map((r: any) => ({ ...r, permissions: r.permissions.map((p: any) => p.permission.code), userCount: r._count?.users ?? 0 }));
    return page;
  }

  @Get("roles/:id")
  @Perm("user.read")
  async role(@Param("id") id: string) {
    const r = await this.prisma.role.findFirst({ where: { id, deletedAt: null }, include: { permissions: { include: { permission: true } } } });
    if (!r) throw new NotFoundException();
    return { ...r, permissions: r.permissions.map((p) => p.permission.code) };
  }

  @Post("roles")
  @Perm("user.write")
  async createRole(@Body(new ZodPipe(usersRoleSchema)) body: z.infer<typeof usersRoleSchema>) {
    return this.prisma.tx(async (tx) => {
      const r = await tx.role.create({ data: { ...body, ...stampCreate() } });
      await this.audit.log({ entity: "role", entityId: r.id, action: "create", after: r }, tx);
      return { ...r, permissions: [] };
    });
  }

  @Patch("roles/:id")
  @Perm("user.write")
  async updateRole(@Param("id") id: string, @Body(new ZodPipe(usersRoleSchema.partial())) body: Partial<z.infer<typeof usersRoleSchema>>) {
    const out = await this.prisma.tx(async (tx) => {
      const before = await tx.role.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundException();
      if (before.isSystem && body.code && body.code !== before.code) throw new BadRequestException("System role codes cannot change");
      const after = await tx.role.update({ where: { id }, data: { ...body, ...stampUpdate() } });
      await this.audit.log({ entity: "role", entityId: id, action: "update", before, after }, tx);
      return after;
    });
    invalidateUserCache();
    return out;
  }

  @Put("roles/:id/permissions")
  @Perm("user.write")
  async setPermissions(@Param("id") id: string, @Body(new ZodPipe(usersRolePermissionsSchema)) body: { codes: string[] }) {
    const unknown = body.codes.filter((c) => !(PERMISSION_CODES as string[]).includes(c));
    if (unknown.length) throw new BadRequestException(`Unknown permissions: ${unknown.join(", ")}`);
    const out = await this.prisma.tx(async (tx) => {
      const role = await tx.role.findFirst({ where: { id, deletedAt: null }, include: { permissions: { include: { permission: true } } } });
      if (!role) throw new NotFoundException();
      if (role.code === "OWNER" && !body.codes.includes("user.write")) throw new BadRequestException("Owner must keep user.write");
      const before = role.permissions.map((p) => p.permission.code).sort();
      const perms = await tx.permission.findMany({ where: { code: { in: body.codes } } });
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      await tx.rolePermission.createMany({ data: perms.map((p) => ({ roleId: id, permissionId: p.id })), skipDuplicates: true });
      const after = perms.map((p) => p.code).sort();
      await this.audit.log({ entity: "role", entityId: id, action: "set_permissions", before, after }, tx);
      return { id, permissions: after };
    });
    invalidateUserCache();
    return out;
  }

  @Delete("roles/:id")
  @Perm("user.write")
  async removeRole(@Param("id") id: string) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.role.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundException();
      if (before.isSystem) throw new BadRequestException("System roles cannot be deleted");
      const users = await tx.user.count({ where: { roleId: id, deletedAt: null } });
      if (users) throw new BadRequestException(`${users} user(s) still have this role`);
      await tx.role.update({ where: { id }, data: { deletedAt: new Date(), ...stampUpdate() } });
      await this.audit.log({ entity: "role", entityId: id, action: "delete", before }, tx);
      return { ok: true };
    });
  }
}
