import { Controller, Get, Param, Query } from "@nestjs/common";
import { z } from "zod";
import { BranchId, CurrentUser, Perm } from "../../common/decorators";
import type { AuthUser } from "../../common/context";
import { ZodPipe } from "../../common/zod.pipe";
import { REPORTS, ReportsService } from "./reports.service";

const reportQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  branchId: z.string().optional(),
});

@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /** Owner/manager dashboard. Stock value only for users who can see cost. */
  @Get("dashboard")
  dashboard(@CurrentUser() user: AuthUser, @BranchId() branchId: string) {
    return this.reports.dashboard(user, branchId);
  }

  @Get("reports")
  @Perm("report.read")
  list(@CurrentUser() user: AuthUser) {
    return REPORTS.filter((r) => !r.perm || user.permissions.has(r.perm));
  }

  @Get("reports/:name")
  @Perm("report.read")
  run(@Param("name") name: string, @Query(new ZodPipe(reportQuery)) q: z.infer<typeof reportQuery>, @CurrentUser() user: AuthUser) {
    if (q.branchId && !user.branchIds.includes(q.branchId)) q.branchId = undefined;
    return this.reports.run(name, user, q);
  }
}
