import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import {
  breakageRateQuerySchema,
  claimCreateSchema,
  claimSettleSchema,
  displayBoardSchema,
  displayItemAddSchema,
  displayItemRemoveSchema,
  listQuerySchema,
  samplesCloseSchema,
  samplesIssueSchema,
  samplesListSchema,
  samplesReturnSchema,
  type SamplesIssueInput,
} from "@gc/shared";
import { BranchId, Perm } from "../../../common/decorators";
import { ZodPipe } from "../../../common/zod.pipe";
import { SamplesService } from "./samples.service";

const sampleListQuery = listQuerySchema.merge(samplesListSchema);
const boardListQuery = listQuerySchema.extend({ godownId: z.string().optional() });
const claimListQuery = listQuerySchema.extend({ status: z.string().optional(), supplierId: z.string().optional() });

@Controller()
export class SamplesController {
  constructor(private readonly svc: SamplesService) {}

  // ---- sanitary colour variants
  @Get("stock/variants")
  @Perm("stock.read")
  variants(@Query(new ZodPipe(z.object({ productId: z.string().min(1) }))) q: { productId: string }, @BranchId() branchId: string) {
    return this.svc.variantStock(q.productId, branchId);
  }

  // ---- samples out
  @Get("samples")
  @Perm("stock.read")
  listSamples(@Query(new ZodPipe(sampleListQuery)) q: any, @BranchId() branchId: string) {
    return this.svc.listSamples(branchId, q);
  }

  @Get("samples/:id")
  @Perm("stock.read")
  getSample(@Param("id") id: string, @BranchId() branchId: string) {
    return this.svc.getSample(id, branchId);
  }

  @Post("samples")
  @Perm("sample.write")
  issue(@Body(new ZodPipe(samplesIssueSchema)) body: SamplesIssueInput, @BranchId() branchId: string) {
    return this.svc.issueSamples(branchId, body);
  }

  @Post("samples/:id/return")
  @Perm("sample.write")
  returnSamples(@Param("id") id: string, @Body(new ZodPipe(samplesReturnSchema)) body: z.infer<typeof samplesReturnSchema>, @BranchId() branchId: string) {
    return this.svc.returnSamples(id, branchId, body);
  }

  @Post("samples/:id/close")
  @Perm("sample.write")
  closeSamples(@Param("id") id: string, @Body(new ZodPipe(samplesCloseSchema)) body: z.infer<typeof samplesCloseSchema>, @BranchId() branchId: string) {
    return this.svc.closeSamples(id, branchId, body);
  }

  // ---- display boards
  @Get("display-boards")
  @Perm("stock.read")
  boards(@Query(new ZodPipe(boardListQuery)) q: any, @BranchId() branchId: string) {
    return this.svc.listBoards(branchId, q);
  }

  @Get("display-boards/:id")
  @Perm("stock.read")
  board(@Param("id") id: string, @BranchId() branchId: string) {
    return this.svc.getBoard(id, branchId);
  }

  @Post("display-boards")
  @Perm("sample.write")
  createBoard(@Body(new ZodPipe(displayBoardSchema)) body: z.infer<typeof displayBoardSchema>, @BranchId() branchId: string) {
    return this.svc.createBoard(branchId, body);
  }

  @Patch("display-boards/:id")
  @Perm("sample.write")
  updateBoard(@Param("id") id: string, @Body(new ZodPipe(displayBoardSchema.partial())) body: Partial<z.infer<typeof displayBoardSchema>>, @BranchId() branchId: string) {
    return this.svc.updateBoard(id, branchId, body);
  }

  @Delete("display-boards/:id")
  @Perm("sample.write")
  deleteBoard(@Param("id") id: string, @BranchId() branchId: string) {
    return this.svc.deleteBoard(id, branchId);
  }

  @Post("display-boards/:id/items")
  @Perm("sample.write")
  addItem(@Param("id") id: string, @Body(new ZodPipe(displayItemAddSchema)) body: z.infer<typeof displayItemAddSchema>, @BranchId() branchId: string) {
    return this.svc.addBoardItem(id, branchId, body);
  }

  @Post("display-boards/:id/items/:itemId/remove")
  @Perm("sample.write")
  removeItem(
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body(new ZodPipe(displayItemRemoveSchema)) body: z.infer<typeof displayItemRemoveSchema>,
    @BranchId() branchId: string,
  ) {
    return this.svc.removeBoardItem(id, itemId, branchId, body);
  }

  // ---- supplier breakage claims
  @Get("breakage-claims/candidates")
  @Perm("purchase.read")
  candidates(@Query(new ZodPipe(z.object({ supplierId: z.string().min(1) }))) q: { supplierId: string }, @BranchId() branchId: string) {
    return this.svc.claimCandidates(branchId, q.supplierId);
  }

  @Get("breakage-claims")
  @Perm("purchase.read")
  claims(@Query(new ZodPipe(claimListQuery)) q: any, @BranchId() branchId: string) {
    return this.svc.listClaims(branchId, q);
  }

  @Get("breakage-claims/:id")
  @Perm("purchase.read")
  claim(@Param("id") id: string, @BranchId() branchId: string) {
    return this.svc.getClaim(id, branchId);
  }

  @Post("breakage-claims")
  @Perm("claim.write")
  createClaim(@Body(new ZodPipe(claimCreateSchema)) body: z.infer<typeof claimCreateSchema>, @BranchId() branchId: string) {
    return this.svc.createClaim(branchId, body);
  }

  @Post("breakage-claims/:id/submit")
  @Perm("claim.write")
  submitClaim(@Param("id") id: string, @BranchId() branchId: string) {
    return this.svc.submitClaim(id, branchId);
  }

  @Post("breakage-claims/:id/settle")
  @Perm("claim.write")
  settleClaim(@Param("id") id: string, @Body(new ZodPipe(claimSettleSchema)) body: z.infer<typeof claimSettleSchema>, @BranchId() branchId: string) {
    return this.svc.settleClaim(id, branchId, body);
  }

  @Delete("breakage-claims/:id")
  @Perm("claim.write")
  deleteClaim(@Param("id") id: string, @BranchId() branchId: string) {
    return this.svc.deleteClaim(id, branchId);
  }

  // ---- breakage rate by supplier / brand
  @Get("stock/breakage-rate")
  @Perm("stock.read")
  breakageRate(@Query(new ZodPipe(breakageRateQuerySchema)) q: z.infer<typeof breakageRateQuerySchema>, @BranchId() branchId: string) {
    return this.svc.breakageRate(branchId, q);
  }
}
