import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { addDays, crmFollowupCreateSchema, crmFollowupDoneSchema, crmLeadSchema, CrmLeadInput, crmSiteVisitSchema, listQuerySchema } from "@gc/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../core/audit.service";
import { NumberingService } from "../../core/numbering.service";
import { SettingsService } from "../../core/settings.service";
import { BranchId, CurrentUser, Perm } from "../../common/decorators";
import type { AuthUser } from "../../common/context";
import { stampCreate, stampUpdate } from "../../common/context";
import { ZodPipe } from "../../common/zod.pipe";
import { paginate, pickFilters, searchWhere } from "../../common/pagination";

const IST = 330 * 60_000;
/** Start of today in IST, as a UTC instant. */
export function istDayStart(d = new Date()): Date {
  const ist = new Date(d.getTime() + IST);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST);
}

const leadList = listQuerySchema.extend({ status: z.string().optional(), source: z.string().optional(), assignedToId: z.string().optional(), mine: z.string().optional() });
const followList = listQuerySchema.extend({ when: z.enum(["today", "overdue", "upcoming", "done", "all"]).default("today"), leadId: z.string().optional(), mine: z.string().optional() });
const visitList = listQuerySchema.extend({ leadId: z.string().optional(), partyId: z.string().optional() });

@Controller()
export class CrmController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly settings: SettingsService,
  ) {}

  // ---- leads
  @Get("leads")
  @Perm("crm.read")
  leads(@Query(new ZodPipe(leadList)) q: z.infer<typeof leadList>, @BranchId() branchId: string, @CurrentUser() user: AuthUser) {
    return paginate(this.prisma.lead, q, {
      where: {
        deletedAt: null,
        branchId,
        ...searchWhere(q.q, ["name", "phone", "requirement", "siteAddress"]),
        ...pickFilters(q, ["status", "source", "assignedToId"]),
        ...(q.mine === "true" ? { assignedToId: user.id } : {}),
      },
      include: { assignedTo: { select: { id: true, name: true } }, party: { select: { id: true, name: true } } },
      orderBy: [{ createdAt: "desc" }],
      allowedSort: ["name", "createdAt", "nextFollowupAt", "status"],
    });
  }

  @Get("leads/:id")
  @Perm("crm.read")
  async lead(@Param("id") id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, deletedAt: null },
      include: {
        assignedTo: { select: { id: true, name: true } },
        party: { select: { id: true, name: true, phone: true } },
        followups: { where: { deletedAt: null }, orderBy: { dueAt: "desc" } },
        visits: { where: { deletedAt: null }, orderBy: { checkInAt: "desc" } },
      },
    });
    if (!lead) throw new NotFoundException("Lead not found");
    const quotation = lead.quotationId ? await this.prisma.quotation.findUnique({ where: { id: lead.quotationId }, select: { id: true, number: true, status: true, totalPaise: true } }) : null;
    return { ...lead, quotation };
  }

  @Post("leads")
  @Perm("crm.write")
  async createLead(@Body(new ZodPipe(crmLeadSchema)) body: CrmLeadInput, @BranchId() branchId: string, @CurrentUser() user: AuthUser) {
    return this.prisma.tx(async (tx) => {
      const lead = await tx.lead.create({
        data: { ...body, email: body.email || null, branchId, assignedToId: body.assignedToId ?? user.id, ...stampCreate() },
      });
      if (body.nextFollowupAt) {
        await tx.followup.create({ data: { leadId: lead.id, dueAt: body.nextFollowupAt, userId: lead.assignedToId, notes: "First follow-up", ...stampCreate() } });
      }
      await this.audit.log({ entity: "lead", entityId: lead.id, action: "create", after: lead }, tx);
      return lead;
    });
  }

  @Patch("leads/:id")
  @Perm("crm.write")
  async updateLead(@Param("id") id: string, @Body(new ZodPipe(crmLeadSchema.partial())) body: Partial<CrmLeadInput>) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.lead.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundException("Lead not found");
      if (body.status === "LOST" && !body.lostReason && !before.lostReason) throw new BadRequestException("Give a reason for losing the lead");
      const after = await tx.lead.update({ where: { id }, data: { ...body, ...(body.email !== undefined ? { email: body.email || null } : {}), ...stampUpdate() } });
      await this.audit.log({ entity: "lead", entityId: id, action: "update", before, after }, tx);
      return after;
    });
  }

  @Delete("leads/:id")
  @Perm("crm.write")
  async deleteLead(@Param("id") id: string) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.lead.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundException("Lead not found");
      await tx.lead.update({ where: { id }, data: { deletedAt: new Date(), ...stampUpdate() } });
      await this.audit.log({ entity: "lead", entityId: id, action: "delete", before }, tx);
      return { ok: true };
    });
  }

  /** Lead → draft quotation (room-wise builder opens on it); lead becomes QUOTED. */
  @Post("leads/:id/convert")
  @Perm("crm.write", "quotation.write")
  async convert(@Param("id") id: string, @BranchId() branchId: string, @CurrentUser() user: AuthUser) {
    const validity = Number(await this.settings.get("quotation.validityDays")) || 15;
    return this.prisma.tx(async (tx) => {
      const lead = await tx.lead.findFirst({ where: { id, deletedAt: null } });
      if (!lead) throw new NotFoundException("Lead not found");
      if (lead.quotationId) {
        const existing = await tx.quotation.findUnique({ where: { id: lead.quotationId } });
        if (existing && !existing.deletedAt) return { quotationId: existing.id, number: existing.number, existing: true };
      }
      const branch = await tx.branch.findUniqueOrThrow({ where: { id: branchId } });
      const party = lead.partyId ? await tx.party.findUnique({ where: { id: lead.partyId } }) : null;
      const date = new Date();
      const number = await this.numbering.next(tx, branchId, "QUOTATION", date);
      const q = await tx.quotation.create({
        data: {
          branchId,
          number,
          date,
          validUntil: addDays(date, validity),
          status: "DRAFT",
          partyId: party?.id ?? null,
          customerName: party ? null : lead.name,
          customerPhone: party ? null : lead.phone,
          influencerId: lead.influencerId,
          salespersonId: lead.assignedToId ?? user.id,
          placeOfSupply: party?.stateCode ?? branch.stateCode,
          notes: lead.requirement,
          ...stampCreate(),
        },
      });
      const after = await tx.lead.update({ where: { id }, data: { quotationId: q.id, status: "QUOTED", ...stampUpdate() } });
      await this.audit.log({ entity: "quotation", entityId: q.id, action: "create_from_lead", after: q }, tx);
      await this.audit.log({ entity: "lead", entityId: id, action: "convert", before: lead, after }, tx);
      return { quotationId: q.id, number: q.number, existing: false };
    });
  }

  // ---- follow-ups
  @Get("followups")
  @Perm("crm.read")
  followups(@Query(new ZodPipe(followList)) q: z.infer<typeof followList>, @BranchId() branchId: string, @CurrentUser() user: AuthUser) {
    const start = istDayStart();
    const end = addDays(start, 1);
    const when =
      q.when === "today"
        ? { doneAt: null, dueAt: { gte: start, lt: end } }
        : q.when === "overdue"
          ? { doneAt: null, dueAt: { lt: start } }
          : q.when === "upcoming"
            ? { doneAt: null, dueAt: { gte: end } }
            : q.when === "done"
              ? { doneAt: { not: null } }
              : {};
    return paginate(this.prisma.followup, q, {
      where: {
        deletedAt: null,
        lead: { branchId, deletedAt: null },
        ...when,
        ...pickFilters(q, ["leadId"]),
        ...(q.mine === "true" ? { userId: user.id } : {}),
        ...(q.q ? { lead: { branchId, deletedAt: null, OR: [{ name: { contains: q.q, mode: "insensitive" } }, { phone: { contains: q.q } }] } } : {}),
      },
      include: { lead: { select: { id: true, name: true, phone: true, status: true, requirement: true } } },
      orderBy: { dueAt: q.when === "done" ? "desc" : "asc" },
    });
  }

  @Post("followups")
  @Perm("crm.write")
  async createFollowup(@Body(new ZodPipe(crmFollowupCreateSchema)) body: z.infer<typeof crmFollowupCreateSchema>, @CurrentUser() user: AuthUser) {
    return this.prisma.tx(async (tx) => {
      const lead = await tx.lead.findFirst({ where: { id: body.leadId, deletedAt: null } });
      if (!lead) throw new NotFoundException("Lead not found");
      const f = await tx.followup.create({ data: { leadId: lead.id, dueAt: body.dueAt, notes: body.notes ?? null, userId: lead.assignedToId ?? user.id, ...stampCreate() } });
      await tx.lead.update({ where: { id: lead.id }, data: { nextFollowupAt: body.dueAt } });
      await this.audit.log({ entity: "followup", entityId: f.id, action: "create", after: f }, tx);
      return f;
    });
  }

  @Post("followups/:id/done")
  @Perm("crm.write")
  async doneFollowup(@Param("id") id: string, @Body(new ZodPipe(crmFollowupDoneSchema)) body: z.infer<typeof crmFollowupDoneSchema>, @CurrentUser() user: AuthUser) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.followup.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundException("Follow-up not found");
      const after = await tx.followup.update({ where: { id }, data: { doneAt: new Date(), outcome: body.outcome, ...stampUpdate() } });
      const lead = await tx.lead.findUniqueOrThrow({ where: { id: before.leadId } });
      let next = null;
      if (body.nextDueAt) {
        next = await tx.followup.create({ data: { leadId: lead.id, dueAt: body.nextDueAt, notes: body.nextNotes ?? null, userId: lead.assignedToId ?? user.id, ...stampCreate() } });
      }
      await tx.lead.update({
        where: { id: lead.id },
        data: {
          nextFollowupAt: body.nextDueAt ?? null,
          status: body.status ?? (lead.status === "NEW" ? "CONTACTED" : lead.status),
          ...stampUpdate(),
        },
      });
      await this.audit.log({ entity: "followup", entityId: id, action: "done", before, after }, tx);
      return { followup: after, next };
    });
  }

  // ---- site visits
  @Get("site-visits")
  @Perm("crm.read")
  visits(@Query(new ZodPipe(visitList)) q: z.infer<typeof visitList>) {
    return paginate(this.prisma.siteVisit, q, {
      where: { deletedAt: null, ...pickFilters(q, ["leadId", "partyId"]), ...searchWhere(q.q, ["notes", "lead.name"]) },
      include: { lead: { select: { id: true, name: true, phone: true } } },
      orderBy: { checkInAt: "desc" },
    });
  }

  @Post("site-visits")
  @Perm("crm.write")
  async createVisit(@Body(new ZodPipe(crmSiteVisitSchema)) body: z.infer<typeof crmSiteVisitSchema>, @CurrentUser() user: AuthUser) {
    return this.prisma.tx(async (tx) => {
      const v = await tx.siteVisit.create({ data: { ...body, userId: user.id, checkInAt: new Date(), ...stampCreate() } });
      if (body.leadId) {
        const lead = await tx.lead.findUnique({ where: { id: body.leadId } });
        if (lead && lead.status === "NEW") await tx.lead.update({ where: { id: lead.id }, data: { status: "CONTACTED" } });
      }
      await this.audit.log({ entity: "site_visit", entityId: v.id, action: "create", after: v }, tx);
      return v;
    });
  }

  /** Salespeople for the "assigned to" picker. */
  @Get("crm/users")
  @Perm("crm.read")
  async users() {
    const items = await this.prisma.user.findMany({ where: { isActive: true, deletedAt: null }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } });
    return { items, total: items.length, page: 1, pageSize: items.length };
  }
}
