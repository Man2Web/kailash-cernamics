import { Injectable, NotFoundException } from "@nestjs/common";
import { DOC_PREFIX, DocType, financialYear, formatDocNo } from "@gc/shared";
import { Tx } from "../prisma/prisma.service";

/**
 * Number series per branch per financial year, e.g. KC/CBE/26-27/0001. The upsert takes a row lock,
 * so concurrent posts get distinct numbers; numbers are never reused (cancelled docs keep theirs).
 */
@Injectable()
export class NumberingService {
  async next(tx: Tx, branchId: string, docType: DocType, date: Date = new Date()): Promise<string> {
    const branch = await tx.branch.findUnique({ where: { id: branchId }, select: { code: true } });
    if (!branch) throw new NotFoundException("Branch not found");
    const fy = financialYear(date);
    const series = await tx.numberSeries.upsert({
      where: { branchId_docType_fy: { branchId, docType, fy } },
      create: { branchId, docType, fy, prefix: DOC_PREFIX[docType], nextNo: 2 },
      update: { nextNo: { increment: 1 } },
    });
    return formatDocNo(series.prefix, branch.code, fy, series.nextNo - 1, series.padding);
  }
}
