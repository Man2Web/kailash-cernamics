import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, Type } from "@nestjs/common";
import { z, ZodType } from "zod";
import { listQuerySchema, PermissionCode } from "@gc/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../core/audit.service";
import { Perm } from "./decorators";
import { ZodPipe } from "./zod.pipe";
import { paginate, pickFilters, searchWhere } from "./pagination";
import { stampCreate, stampUpdate } from "./context";

export interface CrudConfig {
  /** route path, e.g. "brands" */
  path: string;
  /** Prisma delegate name, e.g. "brand" */
  model: string;
  /** audit entity name, e.g. "brand" */
  entity: string;
  read: PermissionCode;
  write: PermissionCode;
  createSchema: ZodType<any>;
  updateSchema?: ZodType<any>;
  searchFields: string[];
  filterFields?: string[];
  include?: Record<string, unknown>;
  orderBy?: Record<string, unknown>;
}

/**
 * Generic list/get/create/update/soft-delete controller for simple masters (brand, size, colour,
 * vehicle...). Validation, permission checks, audit log and soft delete are built in.
 */
export function crudController(cfg: CrudConfig): Type<unknown> {
  const listSchema = listQuerySchema.extend(Object.fromEntries((cfg.filterFields ?? []).map((f) => [f, z.string().optional()])));
  const updateSchema = cfg.updateSchema ?? (cfg.createSchema as any).partial?.() ?? cfg.createSchema;

  @Controller(cfg.path)
  class CrudController {
    constructor(
      readonly prisma: PrismaService,
      readonly audit: AuditService,
    ) {}

    get delegate(): any {
      return (this.prisma as any)[cfg.model];
    }

    @Get()
    @Perm(cfg.read)
    list(@Query(new ZodPipe(listSchema)) q: any) {
      return paginate(this.delegate, q, {
        where: { deletedAt: null, ...searchWhere(q.q, cfg.searchFields), ...pickFilters(q, cfg.filterFields ?? []) },
        include: cfg.include,
        orderBy: cfg.orderBy ?? { name: "asc" },
      });
    }

    @Get(":id")
    @Perm(cfg.read)
    async get(@Param("id") id: string) {
      const row = await this.delegate.findFirst({ where: { id, deletedAt: null }, include: cfg.include });
      if (!row) throw new NotFoundException();
      return row;
    }

    @Post()
    @Perm(cfg.write)
    async create(@Body(new ZodPipe(cfg.createSchema)) body: any) {
      return this.prisma.tx(async (tx: any) => {
        const row = await tx[cfg.model].create({ data: { ...body, ...stampCreate() }, include: cfg.include });
        await this.audit.log({ entity: cfg.entity, entityId: row.id, action: "create", after: row }, tx);
        return row;
      });
    }

    @Patch(":id")
    @Perm(cfg.write)
    async update(@Param("id") id: string, @Body(new ZodPipe(updateSchema)) body: any) {
      return this.prisma.tx(async (tx: any) => {
        const before = await tx[cfg.model].findFirst({ where: { id, deletedAt: null } });
        if (!before) throw new NotFoundException();
        const row = await tx[cfg.model].update({ where: { id }, data: { ...body, ...stampUpdate() }, include: cfg.include });
        await this.audit.log({ entity: cfg.entity, entityId: id, action: "update", before, after: row }, tx);
        return row;
      });
    }

    @Delete(":id")
    @Perm(cfg.write)
    async remove(@Param("id") id: string) {
      return this.prisma.tx(async (tx: any) => {
        const before = await tx[cfg.model].findFirst({ where: { id, deletedAt: null } });
        if (!before) throw new NotFoundException();
        await tx[cfg.model].update({ where: { id }, data: { deletedAt: new Date(), ...stampUpdate() } });
        await this.audit.log({ entity: cfg.entity, entityId: id, action: "delete", before }, tx);
        return { ok: true };
      });
    }
  }

  Object.defineProperty(CrudController, "name", { value: `${cfg.entity.replace(/(^|_)(\w)/g, (_m, _a, c) => c.toUpperCase())}CrudController` });
  return CrudController;
}
