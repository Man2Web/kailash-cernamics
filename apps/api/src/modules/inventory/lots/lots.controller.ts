import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { z } from "zod";
import {
  lotFinderQuerySchema,
  reorderPurchaseOrderSchema,
  reorderQuerySchema,
  shadeStockQuerySchema,
  siteHistoryQuerySchema,
  stockAnalysisQuerySchema,
  type LotFinderQuery,
  type ReorderPurchaseOrderInput,
  type ShadeStockQuery,
} from "@gc/shared";
import { BranchId, Perm } from "../../../common/decorators";
import { ZodPipe } from "../../../common/zod.pipe";
import { LotsService } from "./lots.service";

@Controller("stock")
export class LotsController {
  constructor(private readonly lots: LotsService) {}

  /** Which single shade lot can supply the whole requirement (plus last-delivered shade and alternatives). */
  @Get("lot-finder")
  @Perm("stock.read")
  lotFinder(@BranchId() branchId: string, @Query(new ZodPipe(lotFinderQuerySchema)) q: LotFinderQuery) {
    return this.lots.lotFinder(branchId, q);
  }

  @Get("shades")
  @Perm("stock.read")
  shades(@BranchId() branchId: string, @Query(new ZodPipe(shadeStockQuerySchema)) q: ShadeStockQuery) {
    return this.lots.shades(branchId, q);
  }

  @Get("site-history")
  @Perm("stock.read")
  siteHistory(@Query(new ZodPipe(siteHistoryQuerySchema)) q: z.infer<typeof siteHistoryQuerySchema>) {
    return this.lots.siteHistory(q);
  }

  @Get("analysis")
  @Perm("stock.read")
  analysis(@BranchId() branchId: string, @Query(new ZodPipe(stockAnalysisQuerySchema)) q: z.infer<typeof stockAnalysisQuerySchema>) {
    return this.lots.analysis(branchId, q.groupBy, q);
  }

  @Get("reorder")
  @Perm("purchase.read")
  reorder(@BranchId() branchId: string, @Query(new ZodPipe(reorderQuerySchema)) q: z.infer<typeof reorderQuerySchema>) {
    return this.lots.reorder(branchId, q);
  }

  @Post("reorder/purchase-order")
  @Perm("purchase.write")
  reorderPo(@BranchId() branchId: string, @Body(new ZodPipe(reorderPurchaseOrderSchema)) body: ReorderPurchaseOrderInput) {
    return this.lots.createReorderPo(branchId, body);
  }
}
