import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import {
  listQuerySchema,
  opsCountCreateSchema,
  OpsCountCreateInput,
  opsCountFoundSchema,
  OpsCountFoundInput,
  opsCountLinesSchema,
  OpsCountLinesInput,
  opsCountSubmitSchema,
} from "@gc/shared";
import { BranchId, CurrentUser, Perm } from "../../../common/decorators";
import type { AuthUser } from "../../../common/context";
import { ZodPipe } from "../../../common/zod.pipe";
import { CountsService } from "./counts.service";
import { LabelsService } from "./labels.service";

const opt = z.string().optional();

/** Godown operations: physical stock counts, box/rack labels and scan lookup. */
@Controller()
export class OpsController {
  constructor(
    private readonly counts: CountsService,
    private readonly labels: LabelsService,
  ) {}

  // ---- stock counts
  @Get("stock/counts")
  @Perm("stock.read")
  list(@BranchId() branchId: string, @Query(new ZodPipe(listQuerySchema.extend({ status: opt }))) q: any) {
    return this.counts.list(branchId, q);
  }

  @Get("stock/counts/:id")
  @Perm("stock.read")
  get(@BranchId() branchId: string, @Param("id") id: string) {
    return this.counts.get(branchId, id);
  }

  @Post("stock/counts")
  @Perm("stock.count")
  create(@BranchId() branchId: string, @Body(new ZodPipe(opsCountCreateSchema)) body: OpsCountCreateInput) {
    return this.counts.create(branchId, body);
  }

  @Patch("stock/counts/:id/lines")
  @Perm("stock.count")
  saveLines(@BranchId() branchId: string, @Param("id") id: string, @Body(new ZodPipe(opsCountLinesSchema)) body: OpsCountLinesInput) {
    return this.counts.saveLines(branchId, id, body);
  }

  @Post("stock/counts/:id/lines")
  @Perm("stock.count")
  addFound(@BranchId() branchId: string, @Param("id") id: string, @Body(new ZodPipe(opsCountFoundSchema)) body: OpsCountFoundInput) {
    return this.counts.addFound(branchId, id, body);
  }

  @Post("stock/counts/:id/submit")
  @Perm("stock.count")
  submit(@BranchId() branchId: string, @Param("id") id: string, @Body(new ZodPipe(opsCountSubmitSchema)) body: { treatUncountedAsZero: boolean }) {
    return this.counts.submit(branchId, id, body.treatUncountedAsZero);
  }

  @Post("stock/counts/:id/cancel")
  @Perm("stock.count")
  cancel(@BranchId() branchId: string, @Param("id") id: string) {
    return this.counts.cancel(branchId, id);
  }

  // ---- labels and scan
  @Get("labels/batches")
  @Perm("stock.read")
  batchLabels(@Query(new ZodPipe(z.object({ grnId: opt, productId: opt, batchIds: opt }))) q: { grnId?: string; productId?: string; batchIds?: string }) {
    return this.labels.batchLabels(q);
  }

  @Get("labels/racks")
  @Perm("stock.read")
  rackLabels(@Query("godownId") godownId: string) {
    return this.labels.rackLabels(godownId);
  }

  @Get("scan/resolve")
  @Perm("stock.read")
  resolve(@CurrentUser() user: AuthUser, @BranchId() branchId: string, @Query("code") code: string) {
    return this.labels.resolve(user.branchIds, branchId, code ?? "");
  }
}
