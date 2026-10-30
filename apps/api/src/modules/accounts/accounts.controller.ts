import { Body, Controller, Get, NotFoundException, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import {
  accountsCancelSchema,
  accountsChequeStatusSchema,
  accountsInfluencerPayoutSchema,
  accountsPaymentCreateSchema,
  AccountsPaymentCreate,
  accountsReceiptCreateSchema,
  AccountsReceiptCreate,
  listQuerySchema,
} from "@gc/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { BranchId, Perm } from "../../common/decorators";
import { ZodPipe } from "../../common/zod.pipe";
import { paginate, pickFilters, searchWhere } from "../../common/pagination";
import { CreditService } from "../../core/credit.service";
import { AccountsService } from "./accounts.service";

const receiptListSchema = listQuerySchema.extend({
  mode: z.string().optional(),
  status: z.string().optional(),
  partyId: z.string().optional(),
  chequeStatus: z.string().optional(),
  syncStatus: z.string().optional(),
});
const paymentListSchema = listQuerySchema.extend({ mode: z.string().optional(), status: z.string().optional(), partyId: z.string().optional() });
const outstandingSchema = listQuerySchema.extend({ type: z.enum(["CUSTOMER", "SUPPLIER"]).default("CUSTOMER"), branchOnly: z.string().optional() });
const statementSchema = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() });

@Controller()
export class AccountsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
    private readonly credit: CreditService,
  ) {}

  // ---- receipts
  @Get("receipts")
  @Perm("accounts.read")
  receipts(@Query(new ZodPipe(receiptListSchema)) q: z.infer<typeof receiptListSchema>, @BranchId() branchId: string) {
    return paginate(this.prisma.receipt, q, {
      where: { deletedAt: null, branchId, ...searchWhere(q.q, ["number", "reference", "chequeNo", "party.name"]), ...pickFilters(q, ["mode", "status", "partyId", "chequeStatus", "syncStatus"]) },
      include: { party: { select: { id: true, name: true, phone: true } } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      allowedSort: ["date", "number", "amountPaise"],
    });
  }

  @Get("receipts/:id")
  @Perm("accounts.read")
  async receipt(@Param("id") id: string) {
    const r = await this.prisma.receipt.findFirst({
      where: { id, deletedAt: null },
      include: {
        party: { select: { id: true, name: true, phone: true, gstin: true } },
        allocations: { where: { deletedAt: null }, include: { invoice: { select: { id: true, number: true, date: true, totalPaise: true, paidPaise: true } } } },
      },
    });
    if (!r) throw new NotFoundException("Receipt not found");
    return r;
  }

  @Post("receipts")
  @Perm("receipt.write")
  createReceipt(@Body(new ZodPipe(accountsReceiptCreateSchema)) body: AccountsReceiptCreate, @BranchId() branchId: string) {
    return this.accounts.createReceipt(branchId, body);
  }

  @Post("receipts/:id/allocate")
  @Perm("receipt.write")
  allocate(@Param("id") id: string) {
    return this.accounts.allocateAdvance(id);
  }

  @Post("receipts/:id/cancel")
  @Perm("receipt.write")
  cancelReceipt(@Param("id") id: string, @Body(new ZodPipe(accountsCancelSchema)) body: { reason: string }) {
    return this.accounts.cancelReceipt(id, body.reason);
  }

  @Post("receipts/:id/cheque-status")
  @Perm("receipt.write")
  chequeStatus(@Param("id") id: string, @Body(new ZodPipe(accountsChequeStatusSchema)) body: z.infer<typeof accountsChequeStatusSchema>) {
    return this.accounts.setChequeStatus(id, body.status, body.note);
  }

  /** Open invoices of a customer for the allocation grid (oldest first). */
  @Get("receipts/open-invoices/:partyId")
  @Perm("accounts.read")
  async openInvoices(@Param("partyId") partyId: string) {
    const inv = await this.prisma.invoice.findMany({
      where: { partyId, status: "POSTED", deletedAt: null },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      select: { id: true, number: true, date: true, totalPaise: true, paidPaise: true },
    });
    return inv.filter((i) => i.totalPaise > i.paidPaise).map((i) => ({ ...i, duePaise: Number(i.totalPaise - i.paidPaise) }));
  }

  // ---- cheques
  @Get("cheques")
  @Perm("accounts.read")
  cheques(@Query(new ZodPipe(receiptListSchema)) q: z.infer<typeof receiptListSchema>, @BranchId() branchId: string) {
    return paginate(this.prisma.receipt, q, {
      where: { deletedAt: null, branchId, mode: "CHEQUE", ...searchWhere(q.q, ["number", "chequeNo", "bankName", "party.name"]), ...pickFilters(q, ["chequeStatus", "partyId"]) },
      include: { party: { select: { id: true, name: true, phone: true } } },
      orderBy: [{ chequeDate: "asc" }, { date: "asc" }],
    });
  }

  // ---- supplier payments
  @Get("payments")
  @Perm("accounts.read")
  payments(@Query(new ZodPipe(paymentListSchema)) q: z.infer<typeof paymentListSchema>, @BranchId() branchId: string) {
    return paginate(this.prisma.payment, q, {
      where: { deletedAt: null, branchId, ...searchWhere(q.q, ["number", "reference", "party.name"]), ...pickFilters(q, ["mode", "status", "partyId"]) },
      include: { party: { select: { id: true, name: true } } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      allowedSort: ["date", "number", "amountPaise"],
    });
  }

  @Get("payments/open-bills/:partyId")
  @Perm("accounts.read")
  async openBills(@Param("partyId") partyId: string) {
    const pis = await this.prisma.purchaseInvoice.findMany({
      where: { supplierId: partyId, status: "POSTED", deletedAt: null },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      select: { id: true, number: true, supplierInvoiceNo: true, date: true, totalPaise: true, paidPaise: true },
    });
    return pis.filter((i) => i.totalPaise > i.paidPaise).map((i) => ({ ...i, duePaise: Number(i.totalPaise - i.paidPaise) }));
  }

  @Get("payments/:id")
  @Perm("accounts.read")
  async payment(@Param("id") id: string) {
    const p = await this.prisma.payment.findFirst({
      where: { id, deletedAt: null },
      include: {
        party: { select: { id: true, name: true, phone: true } },
        allocations: { where: { deletedAt: null }, include: { purchaseInvoice: { select: { id: true, number: true, supplierInvoiceNo: true, date: true, totalPaise: true } } } },
      },
    });
    if (!p) throw new NotFoundException("Payment not found");
    return p;
  }

  @Post("payments")
  @Perm("payment.write")
  createPayment(@Body(new ZodPipe(accountsPaymentCreateSchema)) body: AccountsPaymentCreate, @BranchId() branchId: string) {
    return this.accounts.createPayment(branchId, body);
  }

  @Post("payments/:id/cancel")
  @Perm("payment.write")
  cancelPayment(@Param("id") id: string, @Body(new ZodPipe(accountsCancelSchema)) body: { reason: string }) {
    return this.accounts.cancelPayment(id, body.reason);
  }

  // ---- outstanding, statement, credit
  @Get("outstanding")
  @Perm("accounts.read")
  async outstanding(@Query(new ZodPipe(outstandingSchema)) q: z.infer<typeof outstandingSchema>, @BranchId() branchId: string) {
    const { rows, summary } = await this.accounts.outstanding(q.type, q.q, q.branchOnly === "true" ? branchId : undefined);
    const page = q.page ?? 1;
    const size = q.pageSize ?? 25;
    if (q.sort) {
      const dir = q.dir === "desc" ? -1 : 1;
      const key = q.sort as keyof (typeof rows)[number];
      rows.sort((a, b) => ((a[key] as number) > (b[key] as number) ? dir : -dir));
    }
    return { items: rows.slice((page - 1) * size, page * size).map((r) => ({ ...r, id: r.partyId })), total: rows.length, page, pageSize: size, summary };
  }

  @Get("statements/:partyId")
  @Perm("accounts.read")
  statement(@Param("partyId") partyId: string, @Query(new ZodPipe(statementSchema)) q: z.infer<typeof statementSchema>) {
    return this.accounts.statement(partyId, q.from, q.to);
  }

  @Get("credit/:partyId")
  @Perm("accounts.read")
  creditStatus(@Param("partyId") partyId: string) {
    return this.credit.status(this.prisma, partyId);
  }

  // ---- influencer payouts
  @Get("influencer-payouts")
  @Perm("accounts.read")
  payouts(@Query(new ZodPipe(listQuerySchema.extend({ influencerId: z.string().optional(), kind: z.string().optional() }))) q: any) {
    return paginate(this.prisma.influencerLedger, q, {
      where: { deletedAt: null, ...searchWhere(q.q, ["influencer.name", "note"]), ...pickFilters(q, ["influencerId", "kind"]) },
      include: { influencer: { select: { id: true, name: true, type: true, pointsBalance: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  @Post("influencer-payouts")
  @Perm("payment.write")
  payout(@Body(new ZodPipe(accountsInfluencerPayoutSchema)) body: z.infer<typeof accountsInfluencerPayoutSchema>) {
    return this.accounts.influencerPayout(body);
  }
}
