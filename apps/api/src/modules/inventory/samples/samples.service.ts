import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, SampleStatus, StockType } from "@prisma/client";
import { toDateInput, type ListQuery } from "@gc/shared";
import type { z } from "zod";
import type {
  breakageRateQuerySchema,
  claimCreateSchema,
  claimSettleSchema,
  displayBoardSchema,
  displayItemAddSchema,
  displayItemRemoveSchema,
  samplesCloseSchema,
  SamplesIssueInput,
  samplesReturnSchema,
} from "@gc/shared";
import { PrismaService, Tx } from "../../../prisma/prisma.service";
import { LedgerEntry, LedgerService } from "../../../core/ledger.service";
import { NumberingService } from "../../../core/numbering.service";
import { AuditService } from "../../../core/audit.service";
import { stampCreate, stampUpdate } from "../../../common/context";
import { paginate, searchWhere } from "../../../common/pagination";
import { godownInBranch } from "../stock-helpers";

const productSelect = { id: true, sku: true, name: true, uomType: true, unitName: true, pcsPerBox: true, sqftPerBox: true, images: true } as const;
const batchSelect = { id: true, batchNo: true, shadeCode: true, caliber: true, grade: true } as const;

function startOfTodayIst(): Date {
  return new Date(`${toDateInput(new Date())}T00:00:00+05:30`);
}

/**
 * Sanitary colour-variant stock, samples out on loan, showroom display boards and supplier
 * breakage claims. All stock moves go through LedgerService inside one transaction.
 */
@Injectable()
export class SamplesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly numbering: NumberingService,
    private readonly audit: AuditService,
  ) {}

  private async batchOf(db: Tx | PrismaService, productId: string, batchId: string) {
    const b = await db.batch.findFirst({ where: { id: batchId, deletedAt: null } });
    if (!b || b.productId !== productId) throw new BadRequestException("Shade lot does not belong to this product");
    return b;
  }

  // ------------------------------------------------------------------ colour variants

  /** Availability per colour lot (and the DEFAULT lot) by godown for a sanitary / CP product. */
  async variantStock(productId: string, branchId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { ...productSelect, variants: { where: { deletedAt: null }, include: { color: true } } },
    });
    if (!product) throw new NotFoundException("Product not found");
    const [batches, balances] = await Promise.all([
      this.prisma.batch.findMany({ where: { productId, deletedAt: null }, include: { variant: { include: { color: true } } }, orderBy: { batchNo: "asc" } }),
      this.prisma.stockBalance.groupBy({
        by: ["batchId", "godownId", "stockType"],
        where: { productId, branchId },
        _sum: { qtyPcs: true },
      }),
    ]);
    const godowns = await this.prisma.godown.findMany({ where: { id: { in: [...new Set(balances.map((b) => b.godownId))] } }, select: { id: true, name: true, isDisplay: true } });
    const lots = batches.map((b) => {
      const perGodown = new Map<string, Record<string, number>>();
      for (const r of balances.filter((x) => x.batchId === b.id)) {
        const g = perGodown.get(r.godownId) ?? {};
        g[r.stockType] = (g[r.stockType] ?? 0) + (r._sum.qtyPcs ?? 0);
        perGodown.set(r.godownId, g);
      }
      const rows = [...perGodown.entries()].map(([godownId, t]) => ({
        godown: godowns.find((g) => g.id === godownId)!,
        saleable: t.SALEABLE ?? 0,
        reserved: t.RESERVED ?? 0,
        available: (t.SALEABLE ?? 0) - (t.RESERVED ?? 0),
        display: t.DISPLAY ?? 0,
        sample: t.SAMPLE ?? 0,
        damaged: t.DAMAGED ?? 0,
      }));
      return {
        batchId: b.id,
        batchNo: b.batchNo,
        shadeCode: b.shadeCode,
        variant: b.variant ? { id: b.variant.id, skuSuffix: b.variant.skuSuffix, name: b.variant.name, color: b.variant.color?.name ?? null, hex: b.variant.color?.hex ?? null } : null,
        godowns: rows,
        available: rows.reduce((a, r) => a + r.available, 0),
      };
    });
    return { product, lots: lots.filter((l) => l.godowns.length || l.variant) };
  }

  // ------------------------------------------------------------------ samples

  private sampleInclude = {
    party: { select: { id: true, name: true, phone: true } },
    influencer: { select: { id: true, name: true, phone: true } },
    godown: { select: { id: true, name: true } },
    lines: { where: { deletedAt: null }, include: { product: { select: productSelect }, batch: { select: batchSelect } } },
  } satisfies Prisma.SampleIssueInclude;

  async listSamples(branchId: string, q: ListQuery & { status?: SampleStatus; overdue?: string; partyId?: string }) {
    const where: Prisma.SampleIssueWhereInput = {
      branchId,
      deletedAt: null,
      ...(q.status ? { status: q.status } : {}),
      ...(q.partyId ? { partyId: q.partyId } : {}),
      ...(q.overdue === "true" ? { status: { not: "CLOSED" }, expectedReturnDate: { lt: startOfTodayIst() } } : {}),
      ...searchWhere(q.q, ["number", "issuedToName", "phone", "party.name"]),
    };
    return paginate(this.prisma.sampleIssue, q, { where, include: this.sampleInclude, orderBy: { date: "desc" } });
  }

  async getSample(id: string, branchId: string) {
    const s = await this.prisma.sampleIssue.findFirst({ where: { id, branchId, deletedAt: null }, include: this.sampleInclude });
    if (!s) throw new NotFoundException("Sample issue not found");
    return s;
  }

  async issueSamples(branchId: string, input: SamplesIssueInput) {
    return this.prisma.tx(async (tx) => {
      await godownInBranch(tx, input.godownId, branchId);
      let name = input.issuedToName?.trim() || "";
      let phone = input.phone?.trim() || null;
      if (input.partyId) {
        const p = await tx.party.findFirst({ where: { id: input.partyId, deletedAt: null } });
        if (!p) throw new NotFoundException("Customer not found");
        name ||= p.name;
        phone ||= p.phone;
      }
      if (input.influencerId) {
        const inf = await tx.influencer.findFirst({ where: { id: input.influencerId, deletedAt: null } });
        if (!inf) throw new NotFoundException("Influencer not found");
        name ||= inf.name;
        phone ||= inf.phone;
      }
      if (input.leadId) {
        const lead = await tx.lead.findFirst({ where: { id: input.leadId, deletedAt: null } });
        if (!lead) throw new NotFoundException("Lead not found");
        name ||= lead.name;
        phone ||= lead.phone;
      }
      for (const l of input.lines) await this.batchOf(tx, l.productId, l.batchId);
      const date = input.date ?? new Date();
      const number = await this.numbering.next(tx, branchId, "SAMPLE_ISSUE", date);
      const issue = await tx.sampleIssue.create({
        data: {
          branchId,
          number,
          date,
          godownId: input.godownId,
          partyId: input.partyId ?? null,
          influencerId: input.influencerId ?? null,
          leadId: input.leadId ?? null,
          issuedToName: name,
          phone,
          expectedReturnDate: input.expectedReturnDate ?? null,
          notes: input.notes ?? null,
          ...stampCreate(),
          lines: { create: input.lines.map((l) => ({ productId: l.productId, batchId: l.batchId, qtyPcs: l.qtyPcs, ...stampCreate() })) },
        },
        include: { lines: true },
      });
      const entries: LedgerEntry[] = [];
      for (const l of issue.lines) {
        const base = { branchId, productId: l.productId, batchId: l.batchId, godownId: input.godownId, refType: "SAMPLE_ISSUE", refId: issue.id, refLineId: l.id, note: `Samples to ${name}`, postedAt: date };
        entries.push({ ...base, qtyPcs: -l.qtyPcs, stockType: "SALEABLE" }, { ...base, qtyPcs: l.qtyPcs, stockType: "SAMPLE" });
      }
      await this.ledger.post(tx, entries);
      await this.audit.log({ entity: "sample_issue", entityId: issue.id, action: "issue", after: issue }, tx);
      return tx.sampleIssue.findUniqueOrThrow({ where: { id: issue.id }, include: this.sampleInclude });
    });
  }

  private remaining(l: { qtyPcs: number; returnedPcs: number; closedPcs: number }) {
    return l.qtyPcs - l.returnedPcs - l.closedPcs;
  }

  private async refreshStatus(tx: Tx, issueId: string) {
    const lines = await tx.sampleIssueLine.findMany({ where: { issueId, deletedAt: null } });
    const open = lines.some((l) => this.remaining(l) > 0);
    const touched = lines.some((l) => l.returnedPcs > 0 || l.closedPcs > 0);
    const status: SampleStatus = !open ? "CLOSED" : touched ? "PARTIAL" : "OPEN";
    await tx.sampleIssue.update({ where: { id: issueId }, data: { status, ...stampUpdate() } });
  }

  async returnSamples(id: string, branchId: string, input: z.infer<typeof samplesReturnSchema>) {
    return this.prisma.tx(async (tx) => {
      const issue = await tx.sampleIssue.findFirst({ where: { id, branchId, deletedAt: null }, include: { lines: { where: { deletedAt: null } } } });
      if (!issue) throw new NotFoundException("Sample issue not found");
      if (issue.status === "CLOSED") throw new BadRequestException("This sample issue is already closed");
      const entries: LedgerEntry[] = [];
      for (const r of input.lines) {
        const line = issue.lines.find((l) => l.id === r.lineId);
        if (!line) throw new BadRequestException("Line not found on this sample issue");
        const back = r.returnedPcs + r.damagedPcs;
        if (back === 0) continue;
        if (back > this.remaining(line)) throw new BadRequestException(`Only ${this.remaining(line)} pcs are still out on this line`);
        const base = { branchId, productId: line.productId, batchId: line.batchId, godownId: issue.godownId, refType: "SAMPLE_RETURN", refId: issue.id, refLineId: line.id };
        entries.push({ ...base, qtyPcs: -back, stockType: "SAMPLE" });
        if (r.returnedPcs) entries.push({ ...base, qtyPcs: r.returnedPcs, stockType: "SALEABLE" });
        if (r.damagedPcs) entries.push({ ...base, qtyPcs: r.damagedPcs, stockType: "DAMAGED", note: "Sample returned damaged" });
        await tx.sampleIssueLine.update({ where: { id: line.id }, data: { returnedPcs: { increment: back }, ...stampUpdate() } });
      }
      if (!entries.length) throw new BadRequestException("Enter the pieces that came back");
      await this.ledger.post(tx, entries);
      await this.refreshStatus(tx, id);
      const after = await tx.sampleIssue.findUniqueOrThrow({ where: { id }, include: this.sampleInclude });
      await this.audit.log({ entity: "sample_issue", entityId: id, action: "return", before: issue, after }, tx);
      return after;
    });
  }

  async closeSamples(id: string, branchId: string, input: z.infer<typeof samplesCloseSchema>) {
    return this.prisma.tx(async (tx) => {
      const issue = await tx.sampleIssue.findFirst({ where: { id, branchId, deletedAt: null }, include: { lines: { where: { deletedAt: null } } } });
      if (!issue) throw new NotFoundException("Sample issue not found");
      if (issue.status === "CLOSED") throw new BadRequestException("This sample issue is already closed");
      const entries: LedgerEntry[] = [];
      for (const c of input.lines) {
        const line = issue.lines.find((l) => l.id === c.lineId);
        if (!line) throw new BadRequestException("Line not found on this sample issue");
        if (!c.closedPcs) continue;
        if (c.closedPcs > this.remaining(line)) throw new BadRequestException(`Only ${this.remaining(line)} pcs are still out on this line`);
        entries.push({
          branchId,
          productId: line.productId,
          batchId: line.batchId,
          godownId: issue.godownId,
          qtyPcs: -c.closedPcs,
          stockType: "SAMPLE",
          refType: "SAMPLE_WRITEOFF",
          refId: issue.id,
          refLineId: line.id,
          note: input.reason,
        });
        await tx.sampleIssueLine.update({ where: { id: line.id }, data: { closedPcs: { increment: c.closedPcs }, ...stampUpdate() } });
      }
      if (!entries.length) throw new BadRequestException("Enter the pieces to write off");
      await this.ledger.post(tx, entries);
      await this.refreshStatus(tx, id);
      const after = await tx.sampleIssue.findUniqueOrThrow({ where: { id }, include: this.sampleInclude });
      await this.audit.log({ entity: "sample_issue", entityId: id, action: "write_off", before: issue, after: { ...after, reason: input.reason } }, tx);
      return after;
    });
  }

  // ------------------------------------------------------------------ display boards

  private boardInclude = {
    godown: { select: { id: true, name: true } },
    items: {
      where: { removedAt: null, deletedAt: null },
      include: { product: { select: productSelect }, batch: { select: batchSelect } },
      orderBy: { installedAt: "desc" },
    },
  } satisfies Prisma.DisplayBoardInclude;

  async listBoards(branchId: string, q: ListQuery & { godownId?: string }) {
    return paginate(this.prisma.displayBoard, q, {
      where: { branchId, deletedAt: null, ...(q.godownId ? { godownId: q.godownId } : {}), ...searchWhere(q.q, ["code", "name", "location"]) },
      include: this.boardInclude,
      orderBy: { code: "asc" },
    });
  }

  async getBoard(id: string, branchId: string) {
    const b = await this.prisma.displayBoard.findFirst({ where: { id, branchId, deletedAt: null }, include: this.boardInclude });
    if (!b) throw new NotFoundException("Display board not found");
    return b;
  }

  private async showroom(tx: Tx, godownId: string, branchId: string) {
    const g = await godownInBranch(tx, godownId, branchId);
    if (!g.isDisplay) throw new BadRequestException(`${g.name} is not a showroom/display godown`);
    return g;
  }

  async createBoard(branchId: string, input: z.infer<typeof displayBoardSchema>) {
    return this.prisma.tx(async (tx) => {
      await this.showroom(tx, input.godownId, branchId);
      const board = await tx.displayBoard.create({ data: { branchId, ...input, location: input.location ?? null, ...stampCreate() }, include: this.boardInclude });
      await this.audit.log({ entity: "display_board", entityId: board.id, action: "create", after: board }, tx);
      return board;
    });
  }

  async updateBoard(id: string, branchId: string, input: Partial<z.infer<typeof displayBoardSchema>>) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.displayBoard.findFirst({ where: { id, branchId, deletedAt: null }, include: { items: { where: { removedAt: null, deletedAt: null } } } });
      if (!before) throw new NotFoundException("Display board not found");
      if (input.godownId && input.godownId !== before.godownId) {
        if (before.items.length) throw new BadRequestException("Remove the tiles on this board before moving it to another godown");
        await this.showroom(tx, input.godownId, branchId);
      }
      const after = await tx.displayBoard.update({ where: { id }, data: { ...input, ...stampUpdate() }, include: this.boardInclude });
      await this.audit.log({ entity: "display_board", entityId: id, action: "update", before, after }, tx);
      return after;
    });
  }

  async deleteBoard(id: string, branchId: string) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.displayBoard.findFirst({ where: { id, branchId, deletedAt: null }, include: { items: { where: { removedAt: null, deletedAt: null } } } });
      if (!before) throw new NotFoundException("Display board not found");
      if (before.items.length) throw new BadRequestException("Remove the tiles on this board first");
      await tx.displayBoard.update({ where: { id }, data: { deletedAt: new Date(), ...stampUpdate() } });
      await this.audit.log({ entity: "display_board", entityId: id, action: "delete", before }, tx);
      return { ok: true };
    });
  }

  async addBoardItem(boardId: string, branchId: string, input: z.infer<typeof displayItemAddSchema>) {
    return this.prisma.tx(async (tx) => {
      const board = await tx.displayBoard.findFirst({ where: { id: boardId, branchId, deletedAt: null } });
      if (!board) throw new NotFoundException("Display board not found");
      await godownInBranch(tx, input.fromGodownId, branchId);
      await this.batchOf(tx, input.productId, input.batchId);
      const item = await tx.displayBoardItem.create({
        data: { boardId, productId: input.productId, batchId: input.batchId, qtyPcs: input.qtyPcs, ...stampCreate() },
      });
      const base = { branchId, productId: input.productId, batchId: input.batchId, refType: "DISPLAY_BOARD", refId: board.id, refLineId: item.id, note: `Fixed on board ${board.code}` };
      await this.ledger.post(tx, [
        { ...base, godownId: input.fromGodownId, qtyPcs: -input.qtyPcs, stockType: "SALEABLE" },
        { ...base, godownId: board.godownId, qtyPcs: input.qtyPcs, stockType: "DISPLAY" },
      ]);
      await this.audit.log({ entity: "display_board", entityId: board.id, action: "add_item", after: item }, tx);
      return tx.displayBoard.findUniqueOrThrow({ where: { id: boardId }, include: this.boardInclude });
    });
  }

  async removeBoardItem(boardId: string, itemId: string, branchId: string, input: z.infer<typeof displayItemRemoveSchema>) {
    return this.prisma.tx(async (tx) => {
      const board = await tx.displayBoard.findFirst({ where: { id: boardId, branchId, deletedAt: null } });
      if (!board) throw new NotFoundException("Display board not found");
      const item = await tx.displayBoardItem.findFirst({ where: { id: itemId, boardId, removedAt: null, deletedAt: null } });
      if (!item) throw new NotFoundException("Tile not found on this board");
      await godownInBranch(tx, input.toGodownId, branchId);
      const base = { branchId, productId: item.productId, batchId: item.batchId, refType: "DISPLAY_BOARD_REMOVE", refId: board.id, refLineId: item.id, note: `Removed from board ${board.code}` };
      await this.ledger.post(tx, [
        { ...base, godownId: board.godownId, qtyPcs: -item.qtyPcs, stockType: "DISPLAY" },
        { ...base, godownId: input.toGodownId, qtyPcs: item.qtyPcs, stockType: input.toStockType as StockType },
      ]);
      const after = await tx.displayBoardItem.update({ where: { id: itemId }, data: { removedAt: new Date(), ...stampUpdate() } });
      await this.audit.log({ entity: "display_board", entityId: board.id, action: "remove_item", before: item, after }, tx);
      return tx.displayBoard.findUniqueOrThrow({ where: { id: boardId }, include: this.boardInclude });
    });
  }

  // ------------------------------------------------------------------ supplier breakage claims

  private entryValue(e: { qtyPcs: number; batch: { landedCostPaise: bigint; purchaseRatePaise: bigint } }) {
    const rate = Number(e.batch.landedCostPaise) || Number(e.batch.purchaseRatePaise);
    return e.qtyPcs * rate;
  }

  async claimCandidates(branchId: string, supplierId: string) {
    const entries = await this.prisma.breakageEntry.findMany({
      where: {
        branchId,
        claimId: null,
        deletedAt: null,
        status: { not: "CANCELLED" },
        stage: { in: ["RECEIPT", "TRANSIT"] },
        batch: { supplierId },
      },
      include: { product: { select: productSelect }, batch: { select: { ...batchSelect, landedCostPaise: true, purchaseRatePaise: true } }, godown: { select: { name: true } } },
      orderBy: { date: "desc" },
    });
    return entries.map((e) => ({ ...e, valuePaise: this.entryValue(e) }));
  }

  private claimInclude = {
    supplier: { select: { id: true, name: true, phone: true } },
    entries: {
      where: { deletedAt: null },
      include: { product: { select: productSelect }, batch: { select: { ...batchSelect, landedCostPaise: true, purchaseRatePaise: true } } },
    },
  } satisfies Prisma.BreakageClaimInclude;

  async listClaims(branchId: string, q: ListQuery & { status?: string; supplierId?: string }) {
    return paginate(this.prisma.breakageClaim, q, {
      where: {
        branchId,
        deletedAt: null,
        ...(q.status ? { status: q.status as never } : {}),
        ...(q.supplierId ? { supplierId: q.supplierId } : {}),
        ...searchWhere(q.q, ["number", "supplier.name", "settlementRef"]),
      },
      include: { supplier: { select: { id: true, name: true } }, _count: { select: { entries: true } } },
      orderBy: { date: "desc" },
    });
  }

  async getClaim(id: string, branchId: string) {
    const c = await this.prisma.breakageClaim.findFirst({ where: { id, branchId, deletedAt: null }, include: this.claimInclude });
    if (!c) throw new NotFoundException("Claim not found");
    return { ...c, entries: c.entries.map((e) => ({ ...e, valuePaise: this.entryValue(e) })) };
  }

  async createClaim(branchId: string, input: z.infer<typeof claimCreateSchema>) {
    return this.prisma.tx(async (tx) => {
      const supplier = await tx.party.findFirst({ where: { id: input.supplierId, deletedAt: null, type: { in: ["SUPPLIER", "BOTH"] } } });
      if (!supplier) throw new NotFoundException("Supplier not found");
      const entries = await tx.breakageEntry.findMany({
        where: { id: { in: input.entryIds }, branchId, deletedAt: null },
        include: { batch: true, product: { select: { brandId: true } } },
      });
      if (entries.length !== input.entryIds.length) throw new BadRequestException("Some breakage entries were not found");
      for (const e of entries) {
        if (e.claimId) throw new BadRequestException("A breakage entry is already on another claim");
        if (!["RECEIPT", "TRANSIT"].includes(e.stage)) throw new BadRequestException("Only receipt or transit breakage can be claimed from the supplier");
        if (e.batch.supplierId !== supplier.id) throw new BadRequestException("A breakage entry belongs to stock from another supplier");
      }
      const claimed = entries.reduce((a, e) => a + this.entryValue(e), 0);
      const brands = [...new Set(entries.map((e) => e.product.brandId))];
      const date = new Date();
      const number = await this.numbering.next(tx, branchId, "BREAKAGE_CLAIM", date);
      const claim = await tx.breakageClaim.create({
        data: {
          branchId,
          number,
          date,
          supplierId: supplier.id,
          brandId: brands.length === 1 ? brands[0] : null,
          claimedPaise: BigInt(claimed),
          notes: input.notes ?? null,
          ...stampCreate(),
        },
      });
      await tx.breakageEntry.updateMany({ where: { id: { in: input.entryIds } }, data: { claimId: claim.id, ...stampUpdate() } });
      await this.audit.log({ entity: "breakage_claim", entityId: claim.id, action: "create", after: { ...claim, entryIds: input.entryIds } }, tx);
      return claim;
    });
  }

  async submitClaim(id: string, branchId: string) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.breakageClaim.findFirst({ where: { id, branchId, deletedAt: null } });
      if (!before) throw new NotFoundException("Claim not found");
      if (before.status !== "DRAFT") throw new BadRequestException("Only draft claims can be submitted");
      const after = await tx.breakageClaim.update({ where: { id }, data: { status: "SUBMITTED", ...stampUpdate() } });
      await this.audit.log({ entity: "breakage_claim", entityId: id, action: "submit", before, after }, tx);
      return after;
    });
  }

  async settleClaim(id: string, branchId: string, input: z.infer<typeof claimSettleSchema>) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.breakageClaim.findFirst({ where: { id, branchId, deletedAt: null } });
      if (!before) throw new NotFoundException("Claim not found");
      if (!["DRAFT", "SUBMITTED"].includes(before.status)) throw new BadRequestException(`Claim is already ${before.status.toLowerCase()}`);
      const rejected = input.settlementType === "REJECTED";
      if (!rejected && input.settledPaise > Number(before.claimedPaise)) throw new BadRequestException("Settled amount cannot be more than the claim");
      const after = await tx.breakageClaim.update({
        where: { id },
        data: {
          status: rejected ? "REJECTED" : "SETTLED",
          settlementType: input.settlementType,
          settledPaise: BigInt(rejected ? 0 : input.settledPaise),
          settlementRef: input.settlementRef ?? null,
          settledAt: new Date(),
          notes: input.notes ?? before.notes,
          ...stampUpdate(),
        },
      });
      await this.audit.log({ entity: "breakage_claim", entityId: id, action: rejected ? "reject" : "settle", before, after }, tx);
      return after;
    });
  }

  async deleteClaim(id: string, branchId: string) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.breakageClaim.findFirst({ where: { id, branchId, deletedAt: null } });
      if (!before) throw new NotFoundException("Claim not found");
      if (before.status !== "DRAFT") throw new BadRequestException("Only draft claims can be deleted");
      await tx.breakageEntry.updateMany({ where: { claimId: id }, data: { claimId: null, ...stampUpdate() } });
      await tx.breakageClaim.update({ where: { id }, data: { deletedAt: new Date(), ...stampUpdate() } });
      await this.audit.log({ entity: "breakage_claim", entityId: id, action: "delete", before }, tx);
      return { ok: true };
    });
  }

  /** Breakage % by supplier or brand: pieces received on posted GRNs vs pieces broken, by stage. */
  async breakageRate(branchId: string, q: z.infer<typeof breakageRateQuerySchema>) {
    const dateRange = { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) };
    const hasRange = !!(q.from || q.to);
    const grnLines = await this.prisma.grnLine.findMany({
      where: { deletedAt: null, grn: { branchId, status: "POSTED", deletedAt: null, ...(hasRange ? { date: dateRange } : {}) } },
      select: { qtyPcs: true, product: { select: { brandId: true } }, grn: { select: { supplierId: true } } },
    });
    const breakages = await this.prisma.breakageEntry.findMany({
      where: { branchId, deletedAt: null, status: { not: "CANCELLED" }, ...(hasRange ? { date: dateRange } : {}) },
      select: { qtyPcs: true, stage: true, product: { select: { brandId: true } }, batch: { select: { supplierId: true } } },
    });
    type Row = { key: string; receivedPcs: number; RECEIPT: number; TRANSIT: number; GODOWN: number; CUSTOMER: number };
    const rows = new Map<string, Row>();
    const row = (key: string) => {
      let r = rows.get(key);
      if (!r) rows.set(key, (r = { key, receivedPcs: 0, RECEIPT: 0, TRANSIT: 0, GODOWN: 0, CUSTOMER: 0 }));
      return r;
    };
    for (const l of grnLines) row(q.groupBy === "brand" ? l.product.brandId : l.grn.supplierId).receivedPcs += l.qtyPcs;
    for (const b of breakages) {
      const key = q.groupBy === "brand" ? b.product.brandId : b.batch.supplierId;
      if (!key) continue;
      row(key)[b.stage] += b.qtyPcs;
    }
    const names =
      q.groupBy === "brand"
        ? await this.prisma.brand.findMany({ where: { id: { in: [...rows.keys()] } }, select: { id: true, name: true } })
        : await this.prisma.party.findMany({ where: { id: { in: [...rows.keys()] } }, select: { id: true, name: true } });
    return [...rows.values()]
      .map((r) => {
        const brokenPcs = r.RECEIPT + r.TRANSIT + r.GODOWN + r.CUSTOMER;
        return {
          id: r.key,
          name: names.find((n) => n.id === r.key)?.name ?? "Unknown",
          receivedPcs: r.receivedPcs,
          receiptPcs: r.RECEIPT,
          transitPcs: r.TRANSIT,
          godownPcs: r.GODOWN,
          customerPcs: r.CUSTOMER,
          brokenPcs,
          ratePct: r.receivedPcs ? Math.round((brokenPcs / r.receivedPcs) * 10000) / 100 : null,
        };
      })
      .sort((a, b) => (b.ratePct ?? 0) - (a.ratePct ?? 0));
  }
}
