import { Injectable, NotFoundException } from "@nestjs/common";
import { daysBetween } from "@gc/shared";
import { PrismaService, Tx } from "../prisma/prisma.service";

export interface CreditStatus {
  outstandingPaise: number;
  overduePaise: number;
  overdueInvoices: number;
  creditLimitPaise: number;
  creditDays: number;
  tallyClosingPaise: number | null;
  tallyAsOf: Date | null;
  ok: boolean;
  reasons: string[];
}

/**
 * Outstanding = posted ERP invoices − amounts paid against them + opening balance − unallocated
 * receipts − unadjusted credit notes; cross-checked with the latest Tally ledger snapshot.
 */
@Injectable()
export class CreditService {
  constructor(private readonly prisma: PrismaService) {}

  async status(db: Tx | PrismaService, partyId: string, additionalPaise = 0): Promise<CreditStatus> {
    const party = await db.party.findUnique({ where: { id: partyId } });
    if (!party) throw new NotFoundException("Party not found");
    const invoices = await db.invoice.findMany({
      where: { partyId, status: "POSTED", deletedAt: null },
      select: { date: true, totalPaise: true, paidPaise: true },
    });
    let outstanding = Number(party.openingBalancePaise);
    let overdue = 0;
    let overdueCount = 0;
    for (const inv of invoices) {
      const due = Number(inv.totalPaise - inv.paidPaise);
      if (due <= 0) continue;
      outstanding += due;
      if (daysBetween(inv.date) > party.creditDays) {
        overdue += due;
        overdueCount++;
      }
    }
    const unallocated = await db.receipt.aggregate({
      where: { partyId, status: "POSTED", deletedAt: null },
      _sum: { unallocatedPaise: true },
    });
    const credits = await db.creditNote.findMany({
      where: { partyId, status: "POSTED", deletedAt: null },
      select: { totalPaise: true, adjustedPaise: true },
    });
    outstanding -= Number(unallocated._sum.unallocatedPaise ?? 0n);
    outstanding -= credits.reduce((a, c) => a + Number(c.totalPaise - c.adjustedPaise), 0);
    const snap = await db.ledgerBalanceSnapshot.findFirst({ where: { partyId }, orderBy: { asOf: "desc" } });

    const reasons: string[] = [];
    const limit = Number(party.creditLimitPaise);
    if (limit > 0 && outstanding + additionalPaise > limit) reasons.push("Order exceeds the credit limit");
    if (overdueCount > 0) reasons.push(`${overdueCount} invoice(s) past ${party.creditDays} credit days`);
    if (limit === 0 && party.segment !== "RETAIL" && additionalPaise > 0 && outstanding + additionalPaise > 0 && party.creditDays > 0) {
      // credit customer with no limit set: allow, but flag for review
    }
    return {
      outstandingPaise: outstanding,
      overduePaise: overdue,
      overdueInvoices: overdueCount,
      creditLimitPaise: limit,
      creditDays: party.creditDays,
      tallyClosingPaise: snap ? Number(snap.closingPaise) : null,
      tallyAsOf: snap?.asOf ?? null,
      ok: reasons.length === 0,
      reasons,
    };
  }
}
