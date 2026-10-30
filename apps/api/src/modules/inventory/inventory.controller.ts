import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import {
  inventoryAdjustmentSchema,
  InventoryAdjustmentInput,
  inventoryBreakageSchema,
  InventoryBreakageInput,
  inventoryTransferSchema,
  InventoryTransferInput,
  inventoryTransferReceiveSchema,
  InventoryTransferReceiveInput,
  listQuerySchema,
} from "@gc/shared";
import { BranchId, Perm } from "../../common/decorators";
import { ZodPipe } from "../../common/zod.pipe";
import { InventoryService } from "./inventory.service";

const opt = z.string().optional();
const summaryQuery = listQuerySchema.extend({ brandId: opt, categoryId: opt, godownId: opt, inStock: opt });
const ledgerQuery = listQuerySchema.extend({ productId: opt, batchId: opt, godownId: opt, refType: opt, from: opt, to: opt });
const docQuery = listQuerySchema.extend({ status: opt, stage: opt, direction: opt });
const deadQuery = listQuerySchema.extend({ days: z.coerce.number().int().min(1).max(3650).optional() });

@Controller()
export class InventoryController {
  constructor(private readonly svc: InventoryService) {}

  // ---- stock views
  @Get("stock/summary")
  @Perm("stock.read")
  summary(@BranchId() branchId: string, @Query(new ZodPipe(summaryQuery)) q: z.infer<typeof summaryQuery>) {
    return this.svc.summary(branchId, q);
  }

  @Get("stock/products/:productId")
  @Perm("stock.read")
  product(@BranchId() branchId: string, @Param("productId") productId: string) {
    return this.svc.productDetail(branchId, productId);
  }

  @Get("stock/availability")
  @Perm("stock.read")
  availability(@BranchId() branchId: string, @Query("productId") productId?: string) {
    if (!productId) throw new BadRequestException("productId is required");
    return this.svc.availability(branchId, productId);
  }

  @Get("batches")
  @Perm("stock.read")
  batches(@Query(new ZodPipe(listQuerySchema.extend({ productId: opt }))) q: any) {
    return this.svc.batches(q);
  }

  @Get("stock/ledger")
  @Perm("stock.read")
  ledger(@BranchId() branchId: string, @Query(new ZodPipe(ledgerQuery)) q: z.infer<typeof ledgerQuery>) {
    return this.svc.ledgerList(branchId, q);
  }

  // ---- reports
  @Get("stock/low")
  @Perm("stock.read")
  low(@BranchId() branchId: string, @Query(new ZodPipe(listQuerySchema)) q: any) {
    return this.svc.lowStock(branchId, q);
  }

  @Get("stock/dead")
  @Perm("stock.read")
  dead(@BranchId() branchId: string, @Query(new ZodPipe(deadQuery)) q: any) {
    return this.svc.deadStock(branchId, q);
  }

  @Get("stock/ageing")
  @Perm("stock.read")
  ageing(@BranchId() branchId: string, @Query(new ZodPipe(listQuerySchema)) q: any) {
    return this.svc.ageing(branchId, q);
  }

  @Get("stock/value")
  @Perm("stock.read", "cost.read")
  value(@BranchId() branchId: string, @Query(new ZodPipe(listQuerySchema)) q: any) {
    return this.svc.stockValue(branchId, q);
  }

  // ---- transfers (godown/rack moves and SALEABLE ↔ DISPLAY)
  @Get("stock/transfers")
  @Perm("stock.read")
  transfers(@BranchId() branchId: string, @Query(new ZodPipe(docQuery)) q: any) {
    return this.svc.listTransfers(branchId, q);
  }

  @Get("stock/transfers/:id")
  @Perm("stock.read")
  transfer(@BranchId() branchId: string, @Param("id") id: string) {
    return this.svc.getTransfer(branchId, id);
  }

  @Post("stock/transfers")
  @Perm("stock.transfer")
  createTransfer(@BranchId() branchId: string, @Body(new ZodPipe(inventoryTransferSchema)) body: InventoryTransferInput) {
    return this.svc.createTransfer(branchId, body);
  }

  @Post("stock/transfers/:id/receive")
  @Perm("stock.transfer")
  receiveTransfer(@BranchId() branchId: string, @Param("id") id: string, @Body(new ZodPipe(inventoryTransferReceiveSchema)) body: InventoryTransferReceiveInput) {
    return this.svc.receiveTransfer(branchId, id, body);
  }

  @Post("stock/transfers/:id/cancel")
  @Perm("stock.transfer")
  cancelTransfer(@Param("id") id: string) {
    return this.svc.cancelTransfer(id);
  }

  // ---- adjustments (approval required)
  @Get("stock/adjustments")
  @Perm("stock.read")
  adjustments(@BranchId() branchId: string, @Query(new ZodPipe(docQuery)) q: any) {
    return this.svc.listAdjustments(branchId, q);
  }

  @Get("stock/adjustments/:id")
  @Perm("stock.read")
  adjustment(@BranchId() branchId: string, @Param("id") id: string) {
    return this.svc.getAdjustment(branchId, id);
  }

  @Post("stock/adjustments")
  @Perm("stock.adjust")
  createAdjustment(@BranchId() branchId: string, @Body(new ZodPipe(inventoryAdjustmentSchema)) body: InventoryAdjustmentInput) {
    return this.svc.createAdjustment(branchId, body);
  }

  @Patch("stock/adjustments/:id")
  @Perm("stock.adjust")
  updateAdjustment(@BranchId() branchId: string, @Param("id") id: string, @Body(new ZodPipe(inventoryAdjustmentSchema)) body: InventoryAdjustmentInput) {
    return this.svc.updateAdjustment(branchId, id, body);
  }

  @Post("stock/adjustments/:id/submit")
  @Perm("stock.adjust")
  submitAdjustment(@BranchId() branchId: string, @Param("id") id: string) {
    return this.svc.submitAdjustment(branchId, id);
  }

  // ---- breakage
  @Get("stock/breakage")
  @Perm("stock.read")
  breakage(@BranchId() branchId: string, @Query(new ZodPipe(docQuery)) q: any) {
    return this.svc.listBreakage(branchId, q);
  }

  @Post("stock/breakage")
  @Perm("stock.breakage")
  createBreakage(@BranchId() branchId: string, @Body(new ZodPipe(inventoryBreakageSchema)) body: InventoryBreakageInput) {
    return this.svc.createBreakage(branchId, body);
  }

  @Post("stock/breakage/:id/write-off")
  @Perm("stock.breakage")
  writeOff(@BranchId() branchId: string, @Param("id") id: string, @Body(new ZodPipe(z.object({ reason: z.string().trim().min(3).max(500) }))) body: { reason: string }) {
    return this.svc.requestWriteOff(branchId, id, body.reason);
  }
}
