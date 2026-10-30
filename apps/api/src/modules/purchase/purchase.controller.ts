import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import {
  listQuerySchema,
  purchaseDebitNoteSchema,
  PurchaseDebitNoteInput,
  purchaseGrnSchema,
  PurchaseGrnInput,
  purchaseInvoiceSchema,
  PurchaseInvoiceInput,
  purchaseOrderSchema,
  PurchaseOrderInput,
  purchaseSchemeClaimSchema,
  purchaseSchemeSchema,
  PurchaseSchemeInput,
} from "@gc/shared";
import { BranchId, Perm } from "../../common/decorators";
import { ZodPipe } from "../../common/zod.pipe";
import { PurchaseService } from "./purchase.service";

const opt = z.string().optional();
const docQuery = listQuerySchema.extend({ status: opt, supplierId: opt, poId: opt, brandId: opt });

@Controller()
export class PurchaseController {
  constructor(private readonly svc: PurchaseService) {}

  // ---- purchase orders
  @Get("purchase-orders")
  @Perm("purchase.read")
  orders(@BranchId() b: string, @Query(new ZodPipe(docQuery)) q: any) {
    return this.svc.listOrders(b, q);
  }

  @Get("purchase-orders/:id")
  @Perm("purchase.read")
  order(@BranchId() b: string, @Param("id") id: string) {
    return this.svc.getOrder(b, id);
  }

  @Post("purchase-orders")
  @Perm("purchase.write")
  createOrder(@BranchId() b: string, @Body(new ZodPipe(purchaseOrderSchema)) body: PurchaseOrderInput) {
    return this.svc.createOrder(b, body);
  }

  @Patch("purchase-orders/:id")
  @Perm("purchase.write")
  updateOrder(@BranchId() b: string, @Param("id") id: string, @Body(new ZodPipe(purchaseOrderSchema)) body: PurchaseOrderInput) {
    return this.svc.updateOrder(b, id, body);
  }

  @Post("purchase-orders/:id/approve")
  @Perm("purchase.write")
  approveOrder(@BranchId() b: string, @Param("id") id: string) {
    return this.svc.setOrderStatus(b, id, "approve");
  }

  @Post("purchase-orders/:id/cancel")
  @Perm("purchase.write")
  cancelOrder(@BranchId() b: string, @Param("id") id: string) {
    return this.svc.setOrderStatus(b, id, "cancel");
  }

  @Post("purchase-orders/:id/close")
  @Perm("purchase.write")
  closeOrder(@BranchId() b: string, @Param("id") id: string) {
    return this.svc.setOrderStatus(b, id, "close");
  }

  // ---- GRN
  @Get("grns")
  @Perm("purchase.read")
  grns(@BranchId() b: string, @Query(new ZodPipe(docQuery)) q: any) {
    return this.svc.listGrns(b, q);
  }

  @Get("grns/:id")
  @Perm("purchase.read")
  grn(@BranchId() b: string, @Param("id") id: string) {
    return this.svc.getGrn(b, id);
  }

  @Post("grns")
  @Perm("purchase.write")
  createGrn(@BranchId() b: string, @Body(new ZodPipe(purchaseGrnSchema)) body: PurchaseGrnInput) {
    return this.svc.createGrn(b, body);
  }

  @Patch("grns/:id")
  @Perm("purchase.write")
  updateGrn(@BranchId() b: string, @Param("id") id: string, @Body(new ZodPipe(purchaseGrnSchema)) body: PurchaseGrnInput) {
    return this.svc.updateGrn(b, id, body);
  }

  @Post("grns/:id/post")
  @Perm("purchase.write")
  postGrn(@BranchId() b: string, @Param("id") id: string) {
    return this.svc.postGrn(b, id);
  }

  @Post("grns/:id/cancel")
  @Perm("purchase.write")
  cancelGrn(@BranchId() b: string, @Param("id") id: string) {
    return this.svc.cancelGrn(b, id);
  }

  // ---- purchase invoices
  @Get("purchase-invoices")
  @Perm("purchase.read")
  invoices(@BranchId() b: string, @Query(new ZodPipe(docQuery)) q: any) {
    return this.svc.listInvoices(b, q);
  }

  @Get("purchase-invoices/:id")
  @Perm("purchase.read")
  invoice(@BranchId() b: string, @Param("id") id: string) {
    return this.svc.getInvoice(b, id);
  }

  @Post("purchase-invoices")
  @Perm("purchase.write")
  createInvoice(@BranchId() b: string, @Body(new ZodPipe(purchaseInvoiceSchema)) body: PurchaseInvoiceInput) {
    return this.svc.createInvoice(b, body);
  }

  @Patch("purchase-invoices/:id")
  @Perm("purchase.write")
  updateInvoice(@BranchId() b: string, @Param("id") id: string, @Body(new ZodPipe(purchaseInvoiceSchema)) body: PurchaseInvoiceInput) {
    return this.svc.updateInvoice(b, id, body);
  }

  @Post("purchase-invoices/:id/post")
  @Perm("purchase.write")
  postInvoice(@BranchId() b: string, @Param("id") id: string) {
    return this.svc.postInvoice(b, id);
  }

  @Post("purchase-invoices/:id/cancel")
  @Perm("purchase.write")
  cancelInvoice(@BranchId() b: string, @Param("id") id: string) {
    return this.svc.cancelInvoice(b, id);
  }

  // ---- debit notes
  @Get("debit-notes")
  @Perm("purchase.read")
  debitNotes(@BranchId() b: string, @Query(new ZodPipe(docQuery)) q: any) {
    return this.svc.listDebitNotes(b, q);
  }

  @Get("debit-notes/:id")
  @Perm("purchase.read")
  debitNote(@BranchId() b: string, @Param("id") id: string) {
    return this.svc.getDebitNote(b, id);
  }

  @Post("debit-notes")
  @Perm("purchase.write")
  createDebitNote(@BranchId() b: string, @Body(new ZodPipe(purchaseDebitNoteSchema)) body: PurchaseDebitNoteInput) {
    return this.svc.createDebitNote(b, body);
  }

  // ---- brand schemes
  @Get("schemes")
  @Perm("purchase.read")
  schemes(@Query(new ZodPipe(docQuery)) q: any) {
    return this.svc.listSchemes(q);
  }

  @Get("schemes/:id")
  @Perm("purchase.read")
  scheme(@Param("id") id: string) {
    return this.svc.getScheme(id);
  }

  @Get("schemes/:id/progress")
  @Perm("purchase.read")
  async progress(@Param("id") id: string) {
    return (await this.svc.getScheme(id)).progress;
  }

  @Post("schemes")
  @Perm("scheme.write")
  createScheme(@Body(new ZodPipe(purchaseSchemeSchema)) body: PurchaseSchemeInput) {
    return this.svc.createScheme(body);
  }

  @Patch("schemes/:id")
  @Perm("scheme.write")
  updateScheme(@Param("id") id: string, @Body(new ZodPipe(purchaseSchemeSchema)) body: PurchaseSchemeInput) {
    return this.svc.updateScheme(id, body);
  }

  @Delete("schemes/:id")
  @Perm("scheme.write")
  deleteScheme(@Param("id") id: string) {
    return this.svc.deleteScheme(id);
  }

  @Post("schemes/:id/claims")
  @Perm("scheme.write")
  claim(@Param("id") id: string, @Body(new ZodPipe(purchaseSchemeClaimSchema)) body: z.infer<typeof purchaseSchemeClaimSchema>) {
    return this.svc.addClaim(id, body);
  }
}
