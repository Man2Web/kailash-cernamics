import { Body, Controller, Get, HttpCode, Post } from "@nestjs/common";
import { z } from "zod";
import { BranchId, Perm } from "../../common/decorators";
import { ZodPipe } from "../../common/zod.pipe";
import { GoliveService } from "./golive.service";

const rowsSchema = z.object({ rows: z.array(z.record(z.string(), z.unknown())).min(1, "The file has no rows").max(5000) });
type Rows = z.infer<typeof rowsSchema>;

/** Phase 9: opening stock and opening outstanding imports with a validation preview, and the go-live checklist. */
@Controller()
export class GoliveController {
  constructor(private readonly golive: GoliveService) {}

  @Post("import/opening-stock/preview")
  @HttpCode(200)
  @Perm("stock.adjust")
  previewStock(@Body(new ZodPipe(rowsSchema)) body: Rows, @BranchId() branchId: string) {
    return this.golive.previewStock(body.rows, branchId);
  }

  @Post("import/opening-stock/commit")
  @HttpCode(200)
  @Perm("stock.adjust")
  commitStock(@Body(new ZodPipe(rowsSchema)) body: Rows, @BranchId() branchId: string) {
    return this.golive.commitStock(body.rows, branchId);
  }

  @Post("import/opening-outstanding/preview")
  @HttpCode(200)
  @Perm("receipt.write")
  previewBills(@Body(new ZodPipe(rowsSchema)) body: Rows, @BranchId() branchId: string) {
    return this.golive.previewBills(body.rows, branchId);
  }

  @Post("import/opening-outstanding/commit")
  @HttpCode(200)
  @Perm("receipt.write")
  commitBills(@Body(new ZodPipe(rowsSchema)) body: Rows, @BranchId() branchId: string) {
    return this.golive.commitBills(body.rows, branchId);
  }

  @Get("golive/checklist")
  @Perm("org.read")
  checklist(@BranchId() branchId: string) {
    return this.golive.checklist(branchId);
  }
}
