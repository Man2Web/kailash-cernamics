import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { employeeCreateSchema, employeeUpdateSchema, employeeWithLoginSchema, listQuerySchema, PERMISSION_CODES } from "@gc/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../core/audit.service";
import { CurrentUser, Perm } from "../../common/decorators";
import type { AuthUser } from "../../common/context";
import { stampCreate, stampUpdate } from "../../common/context";
import { ZodPipe } from "../../common/zod.pipe";
import { paginate, searchWhere } from "../../common/pagination";
import { hashPassword } from "../../auth/auth.service";
import { ATTENDANCE_DISPLAY_ROLE } from "./attendance.controller";
import { assertSuperAdmin } from "../users/users.controller";

const include = {
  branch: { select: { id: true, code: true, name: true } },
  user: { select: { id: true, email: true, isActive: true, role: { select: { id: true, code: true, name: true } } } },
} as const;

@Controller("employees")
export class EmployeesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private scope(me: AuthUser) {
    return { OR: [{ branchId: null }, { branchId: { in: me.branchIds } }] };
  }

  private assertBranch(me: AuthUser, branchId?: string | null) {
    if (branchId && !me.branchIds.includes(branchId)) throw new ForbiddenException("No access to this branch");
  }

  @Get()
  @Perm("employee.read")
  list(@CurrentUser() me: AuthUser, @Query(new ZodPipe(listQuerySchema.extend({ status: z.string().optional() }))) q: any) {
    return paginate(this.prisma.employee, q, {
      where: {
        deletedAt: null,
        AND: [this.scope(me)],
        ...searchWhere(q.q, ["name", "employeeNo", "email", "phone", "jobTitle", "department"]),
        ...(q.status ? { status: q.status } : {}),
      },
      include,
      orderBy: { name: "asc" },
    });
  }

  @Get(":id")
  @Perm("employee.read")
  async get(@CurrentUser() me: AuthUser, @Param("id") id: string) {
    const e = await this.prisma.employee.findFirst({ where: { id, deletedAt: null, AND: [this.scope(me)] }, include });
    if (!e) throw new NotFoundException();
    return e;
  }

  /** Employee record only (no login). Optionally link an existing login. */
  @Post()
  @Perm("employee.write")
  async create(@CurrentUser() me: AuthUser, @Body(new ZodPipe(employeeCreateSchema)) body: z.infer<typeof employeeCreateSchema>) {
    this.assertBranch(me, body.branchId);
    if (body.userId) await this.assertLinkable(body.userId);
    return this.prisma.tx(async (tx) => {
      const e = await tx.employee.create({ data: { ...body, userId: body.userId || null, branchId: body.branchId || null, ...stampCreate() }, include });
      await this.audit.log({ entity: "employee", entityId: e.id, action: "create", after: e }, tx);
      return e;
    });
  }

  /** Create the employee and their login together (needs both employee and user permissions). */
  @Post("with-login")
  @Perm("employee.write", "user.write")
  async createWithLogin(@CurrentUser() me: AuthUser, @Body(new ZodPipe(employeeWithLoginSchema)) body: z.infer<typeof employeeWithLoginSchema>) {
    this.assertBranch(me, body.branchId);
    for (const b of body.branchIds) this.assertBranch(me, b);
    const role = await this.prisma.role.findFirst({ where: { id: body.roleId, deletedAt: null } });
    if (!role) throw new BadRequestException("Role not found");
    if (role.code === ATTENDANCE_DISPLAY_ROLE) throw new BadRequestException("The attendance screen login is not an employee. Create it under Users.");
    if (role.code === "OWNER" && me.roleCode !== "OWNER") throw new ForbiddenException("Only an owner can create another owner.");
    // Choosing exactly what this person can see (Tally, finance, ...) is the Super Admin's decision alone.
    if (body.access) {
      assertSuperAdmin(me);
      const unknown = body.access.codes.filter((c) => !(PERMISSION_CODES as string[]).includes(c));
      if (unknown.length) throw new BadRequestException(`Unknown permissions: ${unknown.join(", ")}`);
      if (role.code === "OWNER") throw new BadRequestException("The Super Admin always has full access.");
    }
    const passwordHash = await hashPassword(body.password);
    const { password: _p, roleId, branchIds, access, ...emp } = body;
    return this.prisma.tx(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: body.email,
          name: body.name,
          phone: body.phone ?? null,
          roleId,
          passwordHash,
          defaultBranchId: body.branchId ?? branchIds[0] ?? null,
          useCustomAccess: !!access?.useCustomAccess,
          customPermissions: access?.useCustomAccess ? [...new Set(access.codes)].sort() : [],
          ...stampCreate(),
        },
      });
      // "All branches" means every active branch. A login with no branch could not open the app at all.
      const ids = branchIds.length
        ? branchIds
        : body.branchId
          ? [body.branchId]
          : (await tx.branch.findMany({ where: { deletedAt: null, isActive: true }, select: { id: true } })).map((b) => b.id);
      if (ids.length) await tx.userBranch.createMany({ data: ids.map((branchId) => ({ userId: user.id, branchId })), skipDuplicates: true });
      const e = await tx.employee.create({ data: { ...emp, branchId: body.branchId || null, userId: user.id, ...stampCreate() }, include });
      await this.audit.log({ entity: "employee", entityId: e.id, action: "create", after: { ...e, loginCreated: true } }, tx);
      return e;
    });
  }

  @Patch(":id")
  @Perm("employee.write")
  async update(@CurrentUser() me: AuthUser, @Param("id") id: string, @Body(new ZodPipe(employeeUpdateSchema)) body: z.infer<typeof employeeUpdateSchema>) {
    this.assertBranch(me, body.branchId);
    const before = await this.prisma.employee.findFirst({ where: { id, deletedAt: null, AND: [this.scope(me)] } });
    if (!before) throw new NotFoundException();
    if (body.userId && body.userId !== before.userId) await this.assertLinkable(body.userId);
    return this.prisma.tx(async (tx) => {
      const e = await tx.employee.update({ where: { id }, data: { ...body, ...stampUpdate() }, include });
      await this.audit.log({ entity: "employee", entityId: id, action: "update", before, after: e }, tx);
      return e;
    });
  }

  @Delete(":id")
  @Perm("employee.write")
  async remove(@CurrentUser() me: AuthUser, @Param("id") id: string) {
    const before = await this.prisma.employee.findFirst({ where: { id, deletedAt: null, AND: [this.scope(me)] } });
    if (!before) throw new NotFoundException();
    await this.prisma.tx(async (tx) => {
      // Attendance history is kept; the employee is hidden and can no longer check in.
      await tx.employee.update({ where: { id }, data: { deletedAt: new Date(), status: "TERMINATED", userId: null, ...stampUpdate() } });
      await this.audit.log({ entity: "employee", entityId: id, action: "delete", before }, tx);
    });
    return { success: true };
  }

  private async assertLinkable(userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null }, include: { role: true, employee: true } });
    if (!user) throw new BadRequestException("That login does not exist.");
    if (user.employee) throw new BadRequestException("That login is already linked to another employee.");
    if (user.role.code === ATTENDANCE_DISPLAY_ROLE) throw new BadRequestException("The attendance screen login cannot be linked to an employee.");
  }
}
