import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { computeLine, roundToRupee, type SalesReturnInput } from "@gc/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../core/audit.service";
import { NumberingService } from "../../core/numbering.service";
import { LedgerService } from "../../core/ledger.service";
import { TallyQueueService } from "../../core/tally-queue.service";
import { stampCreate } from "../../common/context";
import { productInclude } from "./sales.common";

export const returnInclude = {
  party: true,
  invoice: { select: { id: true, number: true, date: true, isInterState: true } },
  lines: { where: { deletedAt: null }, include: { product: { include: productInclude }, batch: true } },
};

/**
 * Sales returns put stock back as SALEABLE or DAMAGED (per line, into the batch and godown it left
 * from) and raise a credit note with the same GST split as the invoice.
 */
@Injectable()
export class ReturnService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly ledger: LedgerService,
    private readonly tally: TallyQueueService,
  ) {}

  async get(id: string, branchId?: string) {
    const r = await this.prisma.salesReturn.findFirst({ where: { id, deletedAt: null, ...(branchId ? { branchId } : {}) }, include: returnInclude });
    if (!r) throw new NotFoundException("Sales return not found");
    const creditNote = await this.prisma.creditNote.findFirst({ where: { salesReturnId: id, deletedAt: null } });
    return { ...r, creditNote };
  }

  /** Already returned quantity per invoice line. */
  async returnedByLine(invoiceId: string) {
    const rows = await this.prisma.salesReturnLine.findMany({
      where: { deletedAt: null, invoiceLineId: { not: null }, salesReturn: { invoiceId, status: "POSTED", deletedAt: null } },
      select: { invoiceLineId: true, qtyPcs: true },
    });
    const map: Record<string, number> = {};
    for (const r of rows) map[r.invoiceLineId!] = (map[r.invoiceLineId!] ?? 0) + r.qtyPcs;
    return map;
  }

  async create(branchId: string, input: SalesReturnInput) {
    return this.prisma.tx(async (tx) => {
      const inv = await tx.invoice.findFirst({ where: { id: input.invoiceId, branchId, deletedAt: null }, include: { lines: { where: { deletedAt: null } } } });
      if (!inv) throw new NotFoundException("Invoice not found");
      if (inv.status !== "POSTED") throw new BadRequestException("Returns can only be made against posted invoices");
      const already = await this.returnedByLine(inv.id);
      const date = input.date ?? new Date();
      const number = await this.numbering.next(tx, branchId, "SALES_RETURN", date);
      const computed = input.lines.map((l) => {
        const il = inv.lines.find((x) => x.id === l.invoiceLineId);
        if (!il) throw new BadRequestException("Line is not on this invoice");
        if (!il.batchId || !il.godownId) throw new BadRequestException("Invoice line has no batch");
        const left = il.qtyPcs - (already[il.id] ?? 0);
        if (l.qtyPcs > left) throw new BadRequestException(`Only ${left} pcs can still be returned on one of the lines`);
        const t = computeLine({ qtyPcs: l.qtyPcs, ratePaise: Number(il.ratePaise), discountPct: il.discountPct, gstRate: il.gstRate }, inv.isInterState);
        return { l, il, t };
      });
      const sum = (k: "taxablePaise" | "cgstPaise" | "sgstPaise" | "igstPaise") => computed.reduce((a, c) => a + c.t[k], 0);
      const raw = sum("taxablePaise") + sum("cgstPaise") + sum("sgstPaise") + sum("igstPaise");
      const { total } = roundToRupee(raw);
      const ret = await tx.salesReturn.create({
        data: {
          branchId,
          number,
          date,
          invoiceId: inv.id,
          partyId: inv.partyId,
          reason: input.reason ?? null,
          totalPaise: BigInt(total),
          status: "POSTED",
          ...stampCreate(),
          lines: {
            create: computed.map(({ l, il, t }) => ({
              invoiceLineId: il.id,
              productId: il.productId,
              batchId: il.batchId!,
              godownId: il.godownId!,
              qtyPcs: l.qtyPcs,
              toStockType: l.toStockType,
              ratePaise: il.ratePaise,
              taxablePaise: BigInt(t.taxablePaise),
              taxPaise: BigInt(t.taxPaise),
              amountPaise: BigInt(t.amountPaise),
              ...stampCreate(),
            })),
          },
        },
        include: { lines: true },
      });
      await this.ledger.post(
        tx,
        ret.lines.map((rl) => ({
          branchId,
          productId: rl.productId,
          batchId: rl.batchId,
          godownId: rl.godownId,
          qtyPcs: rl.qtyPcs,
          stockType: rl.toStockType,
          refType: "SALES_RETURN",
          refId: ret.id,
          refLineId: rl.id,
          ratePaise: rl.ratePaise,
          note: number,
          postedAt: date,
        })),
      );
      const cnNumber = await this.numbering.next(tx, branchId, "CREDIT_NOTE", date);
      const cn = await tx.creditNote.create({
        data: {
          branchId,
          number: cnNumber,
          date,
          partyId: inv.partyId,
          salesReturnId: ret.id,
          invoiceId: inv.id,
          reason: input.reason ?? `Return against ${inv.number}`,
          taxablePaise: BigInt(sum("taxablePaise")),
          cgstPaise: BigInt(sum("cgstPaise")),
          sgstPaise: BigInt(sum("sgstPaise")),
          igstPaise: BigInt(sum("igstPaise")),
          totalPaise: BigInt(total),
          status: "POSTED",
          syncStatus: "PENDING",
          ...stampCreate(),
        },
      });
      await this.tally.enqueueVoucher(tx, { entityType: "CREDIT_NOTE", entityId: cn.id, branchId, partyId: inv.partyId, productIds: ret.lines.map((l) => l.productId) });
      await this.audit.log({ entity: "sales_return", entityId: ret.id, action: "create", after: ret }, tx);
      await this.audit.log({ entity: "credit_note", entityId: cn.id, action: "create", after: cn }, tx);
      return { ...(await tx.salesReturn.findUniqueOrThrow({ where: { id: ret.id }, include: returnInclude })), creditNote: cn };
    });
  }
}
