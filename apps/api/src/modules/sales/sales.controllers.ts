import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import {
  listQuerySchema,
  salesCancelSchema,
  salesChallanSchema,
  salesDeliverSchema,
  salesDispatchSchema,
  salesInvoiceSchema,
  salesOrderSchema,
  salesQuotationSchema,
  salesQuotationStatusSchema,
  salesReturnSchema,
  salesSplitSchema,
  type SalesInvoiceInput,
  type SalesOrderInput,
  type SalesQuotationInput,
  type SalesReturnInput,
} from "@gc/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { LedgerService } from "../../core/ledger.service";
import { BranchId, Perm } from "../../common/decorators";
import { ZodPipe } from "../../common/zod.pipe";
import { paginate } from "../../common/pagination";
import { docWhere, priceFor } from "./sales.common";
import { QuotationService } from "./quotation.service";
import { OrderService } from "./order.service";
import { InvoiceService } from "./invoice.service";
import { DispatchService } from "./dispatch.service";
import { ReturnService } from "./return.service";

const docListSchema = listQuerySchema.extend({
  status: z.string().optional(),
  partyId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  syncStatus: z.string().optional(),
});
type DocList = z.infer<typeof docListSchema>;
const party = { select: { id: true, name: true, phone: true } };

@Controller("quotations")
export class QuotationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly svc: QuotationService,
  ) {}

  @Get()
  @Perm("sales.read")
  list(@Query(new ZodPipe(docListSchema)) q: DocList, @BranchId() branchId: string) {
    const where: any = docWhere(q, branchId);
    if (q.q) where.OR.push({ customerName: { contains: q.q, mode: "insensitive" } });
    return paginate(this.prisma.quotation, q, { where, include: { party }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] });
  }

  @Get(":id")
  @Perm("sales.read")
  get(@Param("id") id: string, @BranchId() branchId: string) {
    return this.svc.get(id, branchId);
  }

  @Post()
  @Perm("quotation.write")
  create(@Body(new ZodPipe(salesQuotationSchema)) body: SalesQuotationInput, @BranchId() branchId: string) {
    return this.svc.create(branchId, body);
  }

  @Patch(":id")
  @Perm("quotation.write")
  update(@Param("id") id: string, @Body(new ZodPipe(salesQuotationSchema)) body: SalesQuotationInput, @BranchId() branchId: string) {
    return this.svc.update(id, branchId, body);
  }

  @Post(":id/revise")
  @Perm("quotation.write")
  revise(@Param("id") id: string, @BranchId() branchId: string) {
    return this.svc.revise(id, branchId);
  }

  @Post(":id/status")
  @Perm("quotation.write")
  status(@Param("id") id: string, @Body(new ZodPipe(salesQuotationStatusSchema)) body: { status: "SENT" | "ACCEPTED" | "REJECTED" }, @BranchId() branchId: string) {
    return this.svc.setStatus(id, branchId, body.status);
  }

  @Get(":id/share")
  @Perm("sales.read")
  share(@Param("id") id: string, @BranchId() branchId: string) {
    return this.svc.share(id, branchId);
  }

  @Post(":id/convert")
  @Perm("order.write")
  convert(@Param("id") id: string, @BranchId() branchId: string) {
    return this.svc.convert(id, branchId);
  }
}

@Controller("sales-orders")
export class SalesOrdersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly svc: OrderService,
    private readonly invoices: InvoiceService,
  ) {}

  @Get()
  @Perm("sales.read")
  list(@Query(new ZodPipe(docListSchema)) q: DocList, @BranchId() branchId: string) {
    return paginate(this.prisma.salesOrder, q, { where: docWhere(q, branchId), include: { party }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] });
  }

  @Get(":id")
  @Perm("sales.read")
  get(@Param("id") id: string, @BranchId() branchId: string) {
    return this.svc.get(id, branchId);
  }

  @Post()
  @Perm("order.write")
  create(@Body(new ZodPipe(salesOrderSchema)) body: SalesOrderInput, @BranchId() branchId: string) {
    return this.svc.create(branchId, body);
  }

  @Patch(":id")
  @Perm("order.write")
  update(@Param("id") id: string, @Body(new ZodPipe(salesOrderSchema)) body: SalesOrderInput, @BranchId() branchId: string) {
    return this.svc.update(id, branchId, body);
  }

  @Post(":id/confirm")
  @Perm("order.write")
  confirm(@Param("id") id: string, @BranchId() branchId: string) {
    return this.svc.confirm(id, branchId);
  }

  @Post(":id/lines/:lineId/split")
  @Perm("order.write")
  split(@Param("id") id: string, @Param("lineId") lineId: string, @Body(new ZodPipe(salesSplitSchema)) body: z.infer<typeof salesSplitSchema>, @BranchId() branchId: string) {
    return this.svc.split(id, lineId, branchId, body);
  }

  @Post(":id/cancel")
  @Perm("order.write")
  cancel(@Param("id") id: string, @Body(new ZodPipe(salesCancelSchema)) body: { reason: string }, @BranchId() branchId: string) {
    return this.svc.cancel(id, branchId, body.reason);
  }

  @Post(":id/invoice")
  @Perm("invoice.write")
  invoice(@Param("id") id: string, @BranchId() branchId: string) {
    return this.invoices.fromOrder(id, branchId);
  }
}

@Controller("invoices")
export class InvoicesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly svc: InvoiceService,
  ) {}

  @Get()
  @Perm("sales.read")
  list(@Query(new ZodPipe(docListSchema)) q: DocList, @BranchId() branchId: string) {
    const where: any = docWhere(q, branchId);
    if (q.syncStatus) where.syncStatus = q.syncStatus;
    return paginate(this.prisma.invoice, q, { where, include: { party }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] });
  }

  @Get("shade-check")
  @Perm("sales.read")
  async shadeCheck(@Query(new ZodPipe(z.object({ siteId: z.string().min(1), productId: z.string().min(1), batchId: z.string().min(1) }))) q: { siteId: string; productId: string; batchId: string }) {
    const batch = await this.prisma.batch.findUnique({ where: { id: q.batchId } });
    if (!batch) throw new BadRequestException("Batch not found");
    const earlierShades = await this.svc.shadeCheck(this.prisma, q.siteId, q.productId, batch.shadeCode);
    return {
      mismatch: earlierShades.length > 0,
      shade: batch.shadeCode,
      earlierShades,
      message: earlierShades.length ? `This site earlier received shade ${earlierShades.join(", ")}; you picked ${batch.shadeCode}` : null,
    };
  }

  @Get(":id")
  @Perm("sales.read")
  get(@Param("id") id: string, @BranchId() branchId: string) {
    return this.svc.get(id, branchId);
  }

  @Post()
  @Perm("invoice.write")
  create(@Body(new ZodPipe(salesInvoiceSchema)) body: SalesInvoiceInput, @BranchId() branchId: string) {
    return this.svc.create(branchId, body);
  }

  @Patch(":id")
  @Perm("invoice.write")
  update(@Param("id") id: string, @Body(new ZodPipe(salesInvoiceSchema)) body: SalesInvoiceInput, @BranchId() branchId: string) {
    return this.svc.update(id, branchId, body);
  }

  @Post(":id/post")
  @Perm("invoice.write")
  post(@Param("id") id: string, @BranchId() branchId: string) {
    return this.svc.post(id, branchId);
  }

  @Post(":id/cancel")
  @Perm("invoice.cancel")
  cancel(@Param("id") id: string, @Body(new ZodPipe(salesCancelSchema)) body: { reason: string }, @BranchId() branchId: string) {
    return this.svc.cancel(id, branchId, body.reason);
  }
}

@Controller()
export class DispatchController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly svc: DispatchService,
  ) {}

  @Get("challans")
  @Perm("sales.read")
  list(@Query(new ZodPipe(docListSchema)) q: DocList, @BranchId() branchId: string) {
    return paginate(this.prisma.deliveryChallan, q, {
      where: docWhere(q, branchId),
      include: { party, invoice: { select: { id: true, number: true } }, dispatches: { where: { deletedAt: null }, select: { id: true, deliveredAt: true, vehicle: { select: { number: true } } } } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
  }

  @Get("challans/:id")
  @Perm("sales.read")
  get(@Param("id") id: string, @BranchId() branchId: string) {
    return this.svc.get(id, branchId);
  }

  @Post("challans")
  @Perm("dispatch.write")
  create(@Body(new ZodPipe(salesChallanSchema)) body: z.infer<typeof salesChallanSchema>, @BranchId() branchId: string) {
    return this.svc.create(branchId, body);
  }

  @Post("challans/:id/cancel")
  @Perm("dispatch.write")
  cancel(@Param("id") id: string, @BranchId() branchId: string) {
    return this.svc.cancel(id, branchId);
  }

  @Post("challans/:id/dispatch")
  @Perm("dispatch.write")
  dispatch(@Param("id") id: string, @Body(new ZodPipe(salesDispatchSchema)) body: z.infer<typeof salesDispatchSchema>, @BranchId() branchId: string) {
    return this.svc.dispatch(id, branchId, body);
  }

  @Post("dispatches/:id/deliver")
  @Perm("dispatch.write")
  deliver(@Param("id") id: string, @Body(new ZodPipe(salesDeliverSchema)) body: z.infer<typeof salesDeliverSchema>, @BranchId() branchId: string) {
    return this.svc.deliver(id, branchId, body);
  }
}

@Controller()
export class ReturnsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly svc: ReturnService,
  ) {}

  @Get("sales-returns")
  @Perm("sales.read")
  list(@Query(new ZodPipe(docListSchema)) q: DocList, @BranchId() branchId: string) {
    return paginate(this.prisma.salesReturn, q, { where: docWhere(q, branchId), include: { party, invoice: { select: { id: true, number: true } } }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] });
  }

  @Get("sales-returns/returnable/:invoiceId")
  @Perm("sales.read")
  returnable(@Param("invoiceId") invoiceId: string) {
    return this.svc.returnedByLine(invoiceId);
  }

  @Get("sales-returns/:id")
  @Perm("sales.read")
  get(@Param("id") id: string, @BranchId() branchId: string) {
    return this.svc.get(id, branchId);
  }

  @Post("sales-returns")
  @Perm("return.write")
  create(@Body(new ZodPipe(salesReturnSchema)) body: SalesReturnInput, @BranchId() branchId: string) {
    return this.svc.create(branchId, body);
  }

  @Get("credit-notes")
  @Perm("sales.read")
  creditNotes(@Query(new ZodPipe(docListSchema)) q: DocList, @BranchId() branchId: string) {
    return paginate(this.prisma.creditNote, q, { where: docWhere(q, branchId), include: { party }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] });
  }
}

/** Helpers for the billing screens: per-batch availability and default price. */
@Controller("sales")
export class SalesLookupController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  @Get("availability")
  @Perm("sales.read")
  async availability(@Query(new ZodPipe(z.object({ productId: z.string().min(1) }))) q: { productId: string }, @BranchId() branchId: string) {
    const rows = await this.ledger.batchAvailability(this.prisma, q.productId, branchId);
    return rows.map((r) => ({
      batchId: r.batchId,
      godownId: r.godownId,
      saleable: r.saleable,
      reserved: r.reserved,
      available: r.available,
      batchNo: r.batch?.batchNo,
      shadeCode: r.batch?.shadeCode,
      caliber: r.batch?.caliber,
      grade: r.batch?.grade,
      godownName: r.godown?.name,
    }));
  }

  @Get("price")
  @Perm("sales.read")
  async price(@Query(new ZodPipe(z.object({ productId: z.string().min(1), partyId: z.string().optional() }))) q: { productId: string; partyId?: string }) {
    const p = q.partyId ? await this.prisma.party.findUnique({ where: { id: q.partyId }, select: { segment: true } }) : null;
    return priceFor(this.prisma, q.productId, p?.segment ?? "RETAIL");
  }
}
