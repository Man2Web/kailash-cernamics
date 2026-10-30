import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { listQuerySchema, orgBranchSchema, orgCompanySchema, orgNumberSeriesSchema } from "@gc/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../core/audit.service";
import { Perm } from "../../common/decorators";
import { ZodPipe } from "../../common/zod.pipe";
import { paginate, pickFilters, searchWhere } from "../../common/pagination";
import { stampCreate, stampUpdate } from "../../common/context";
import { invalidateUserCache } from "../../common/guards";

@Controller()
export class OrgController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---- company (single row)
  @Get("company")
  @Perm("org.read")
  async company() {
    const c = await this.prisma.company.findFirst({ where: { deletedAt: null } });
    if (!c) throw new NotFoundException("Company not set up");
    return c;
  }

  @Patch("company")
  @Perm("org.write")
  async updateCompany(@Body(new ZodPipe(orgCompanySchema.partial())) body: z.infer<typeof orgCompanySchema>) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.company.findFirst({ where: { deletedAt: null } });
      if (!before) throw new NotFoundException("Company not set up");
      const after = await tx.company.update({ where: { id: before.id }, data: { ...body, gstin: body.gstin || null, ...stampUpdate() } });
      await this.audit.log({ entity: "company", entityId: before.id, action: "update", before, after }, tx);
      return after;
    });
  }

  // ---- branches
  @Get("branches")
  @Perm("org.read")
  branches(@Query(new ZodPipe(listQuerySchema.extend({ isActive: z.string().optional() }))) q: any) {
    return paginate(this.prisma.branch, q, {
      where: { deletedAt: null, ...searchWhere(q.q, ["name", "code", "city"]), ...pickFilters(q, ["isActive"]) },
      include: { godowns: { where: { deletedAt: null }, orderBy: { code: "asc" } } },
      orderBy: { code: "asc" },
    });
  }

  @Get("branches/:id")
  @Perm("org.read")
  async branch(@Param("id") id: string) {
    const b = await this.prisma.branch.findFirst({
      where: { id, deletedAt: null },
      include: { godowns: { where: { deletedAt: null }, include: { racks: { where: { deletedAt: null }, orderBy: { code: "asc" } } }, orderBy: { code: "asc" } } },
    });
    if (!b) throw new NotFoundException();
    return b;
  }

  @Post("branches")
  @Perm("org.write")
  async createBranch(@Body(new ZodPipe(orgBranchSchema)) body: z.infer<typeof orgBranchSchema>) {
    return this.prisma.tx(async (tx) => {
      const company = await tx.company.findFirst({ where: { deletedAt: null } });
      if (!company) throw new NotFoundException("Company not set up");
      const row = await tx.branch.create({ data: { ...body, gstin: body.gstin || null, companyId: company.id, ...stampCreate() } });
      await this.audit.log({ entity: "branch", entityId: row.id, action: "create", after: row }, tx);
      invalidateUserCache();
      return row;
    });
  }

  @Patch("branches/:id")
  @Perm("org.write")
  async updateBranch(@Param("id") id: string, @Body(new ZodPipe(orgBranchSchema.partial())) body: Partial<z.infer<typeof orgBranchSchema>>) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.branch.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundException();
      const after = await tx.branch.update({ where: { id }, data: { ...body, ...(body.gstin !== undefined ? { gstin: body.gstin || null } : {}), ...stampUpdate() } });
      await this.audit.log({ entity: "branch", entityId: id, action: "update", before, after }, tx);
      invalidateUserCache();
      return after;
    });
  }

  // ---- number series (per branch, doc type, FY)
  @Get("number-series")
  @Perm("org.read")
  numberSeries(@Query(new ZodPipe(listQuerySchema.extend({ branchId: z.string().optional(), fy: z.string().optional() }))) q: any) {
    return paginate(this.prisma.numberSeries, q, {
      where: { deletedAt: null, ...pickFilters(q, ["branchId", "fy"]), ...searchWhere(q.q, ["docType", "prefix"]) },
      orderBy: [{ fy: "desc" }, { docType: "asc" }],
    });
  }

  @Patch("number-series/:id")
  @Perm("org.write")
  async updateSeries(@Param("id") id: string, @Body(new ZodPipe(orgNumberSeriesSchema.partial())) body: Partial<z.infer<typeof orgNumberSeriesSchema>>) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.numberSeries.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundException();
      if (body.nextNo !== undefined && body.nextNo < before.nextNo) {
        // never reuse numbers
        throw new NotFoundException("Next number can only move forward (numbers are never reused)");
      }
      const after = await tx.numberSeries.update({ where: { id }, data: { ...body, ...stampUpdate() } });
      await this.audit.log({ entity: "number_series", entityId: id, action: "update", before, after }, tx);
      return after;
    });
  }
}
