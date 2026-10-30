import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { listQuerySchema, partiesPartySchema, partiesSiteSchema, type PartyInput } from "@gc/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../core/audit.service";
import { CreditService } from "../../core/credit.service";
import { Perm } from "../../common/decorators";
import { ZodPipe } from "../../common/zod.pipe";
import { paginate, pickFilters, searchWhere } from "../../common/pagination";
import { stampCreate, stampUpdate } from "../../common/context";

const listSchema = listQuerySchema.extend({
  type: z.enum(["CUSTOMER", "SUPPLIER", "BOTH"]).optional(),
  segment: z.string().optional(),
  isActive: z.string().optional(),
  city: z.string().optional(),
});

function partyData(p: PartyInput) {
  return {
    ...p,
    email: p.email || null,
    gstin: p.gstin ? p.gstin.toUpperCase() : null,
    creditLimitPaise: BigInt(p.creditLimitPaise ?? 0),
    openingBalancePaise: BigInt(p.openingBalancePaise ?? 0),
  };
}

@Controller()
export class PartiesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly credit: CreditService,
  ) {}

  /** type=CUSTOMER also returns BOTH; type=SUPPLIER also returns BOTH. */
  @Get("parties")
  @Perm("party.read")
  list(@Query(new ZodPipe(listSchema)) q: z.infer<typeof listSchema>) {
    const typeWhere = q.type === "CUSTOMER" || q.type === "SUPPLIER" ? { type: { in: [q.type, "BOTH"] as never } } : q.type ? { type: q.type } : {};
    return paginate(this.prisma.party, q, {
      where: { deletedAt: null, ...typeWhere, ...searchWhere(q.q, ["name", "phone", "gstin", "city"]), ...pickFilters(q, ["segment", "isActive", "city"]) },
      orderBy: { name: "asc" },
    });
  }

  @Get("parties/:id")
  @Perm("party.read")
  async get(@Param("id") id: string) {
    const p = await this.prisma.party.findFirst({ where: { id, deletedAt: null }, include: { sites: { where: { deletedAt: null }, orderBy: { name: "asc" } } } });
    if (!p) throw new NotFoundException("Party not found");
    return p;
  }

  /** Outstanding, overdue and Tally cross-check for the party page and credit control. */
  @Get("parties/:id/credit")
  @Perm("party.read")
  creditStatus(@Param("id") id: string) {
    return this.credit.status(this.prisma, id);
  }

  @Post("parties")
  @Perm("party.write")
  async create(@Body(new ZodPipe(partiesPartySchema)) body: PartyInput) {
    return this.prisma.tx(async (tx) => {
      const row = await tx.party.create({ data: { ...partyData(body), ...stampCreate() } });
      await this.audit.log({ entity: "party", entityId: row.id, action: "create", after: row }, tx);
      return row;
    });
  }

  /** Full-object update validated with the create rules (GSTIN checksum, state code). */
  @Patch("parties/:id")
  @Perm("party.write")
  async update(@Param("id") id: string, @Body() raw: Record<string, unknown>) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.party.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundException();
      const merged = { ...JSON.parse(JSON.stringify(before)), ...raw };
      const body = new ZodPipe(partiesPartySchema).transform(merged);
      const after = await tx.party.update({ where: { id }, data: { ...partyData(body), ...stampUpdate() } });
      await this.audit.log({ entity: "party", entityId: id, action: "update", before, after }, tx);
      return after;
    });
  }

  @Delete("parties/:id")
  @Perm("party.write")
  async remove(@Param("id") id: string) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.party.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundException();
      await tx.party.update({ where: { id }, data: { deletedAt: new Date(), isActive: false, ...stampUpdate() } });
      await this.audit.log({ entity: "party", entityId: id, action: "delete", before }, tx);
      return { ok: true };
    });
  }

  // ---- sites (builder/contractor site-wise orders)
  @Get("parties/:id/sites")
  @Perm("party.read")
  sites(@Param("id") id: string) {
    return this.prisma.site.findMany({ where: { partyId: id, deletedAt: null }, orderBy: { name: "asc" } });
  }

  @Post("parties/:id/sites")
  @Perm("party.write")
  async createSite(@Param("id") partyId: string, @Body(new ZodPipe(partiesSiteSchema)) body: z.infer<typeof partiesSiteSchema>) {
    return this.prisma.tx(async (tx) => {
      const party = await tx.party.findFirst({ where: { id: partyId, deletedAt: null } });
      if (!party) throw new NotFoundException("Party not found");
      const row = await tx.site.create({ data: { ...body, partyId, ...stampCreate() } });
      await this.audit.log({ entity: "site", entityId: row.id, action: "create", after: row }, tx);
      return row;
    });
  }

  @Patch("sites/:id")
  @Perm("party.write")
  async updateSite(@Param("id") id: string, @Body(new ZodPipe(partiesSiteSchema.partial())) body: Partial<z.infer<typeof partiesSiteSchema>>) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.site.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundException();
      const after = await tx.site.update({ where: { id }, data: { ...body, ...stampUpdate() } });
      await this.audit.log({ entity: "site", entityId: id, action: "update", before, after }, tx);
      return after;
    });
  }

  @Delete("sites/:id")
  @Perm("party.write")
  async removeSite(@Param("id") id: string) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.site.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundException();
      await tx.site.update({ where: { id }, data: { deletedAt: new Date(), ...stampUpdate() } });
      await this.audit.log({ entity: "site", entityId: id, action: "delete", before }, tx);
      return { ok: true };
    });
  }
}
