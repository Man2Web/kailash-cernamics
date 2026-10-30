import { Injectable } from "@nestjs/common";
import { Tx } from "../prisma/prisma.service";
import { stampCreate } from "../common/context";

export const TALLY_PRIORITY = { MASTER: 10, VOUCHER: 50 } as const;

/**
 * Tally sync is asynchronous: posting a document only inserts a tally_sync_queue row. The agent
 * pulls the queue (masters before vouchers) and the XML is built at pull time by the tally module.
 * Never call Tally from a request handler.
 */
@Injectable()
export class TallyQueueService {
  async enqueue(
    tx: Tx,
    item: { entityType: string; entityId: string; branchId?: string | null; priority?: number; direction?: "TO_TALLY" | "FROM_TALLY" },
  ) {
    const pending = await tx.tallySyncQueue.findFirst({
      where: { entityType: item.entityType, entityId: item.entityId, status: { in: ["PENDING", "SENT"] }, deletedAt: null },
    });
    if (pending) return pending;
    return tx.tallySyncQueue.create({
      data: {
        entityType: item.entityType,
        entityId: item.entityId,
        branchId: item.branchId ?? null,
        priority: item.priority ?? TALLY_PRIORITY.VOUCHER,
        direction: item.direction ?? "TO_TALLY",
        ...stampCreate(),
      },
    });
  }

  /** Queue a voucher plus any masters it depends on that Tally doesn't know yet. */
  async enqueueVoucher(
    tx: Tx,
    v: { entityType: string; entityId: string; branchId: string; partyId: string; productIds?: string[] },
  ) {
    const party = await tx.party.findUnique({ where: { id: v.partyId }, select: { tallyLedgerGuid: true } });
    if (!party?.tallyLedgerGuid) {
      await this.enqueue(tx, { entityType: "LEDGER", entityId: v.partyId, branchId: v.branchId, priority: TALLY_PRIORITY.MASTER });
    }
    if (v.productIds?.length) {
      const missing = await tx.product.findMany({
        where: { id: { in: v.productIds }, tallyStockItemGuid: null },
        select: { id: true },
      });
      for (const p of missing) {
        await this.enqueue(tx, { entityType: "STOCK_ITEM", entityId: p.id, branchId: v.branchId, priority: TALLY_PRIORITY.MASTER });
      }
    }
    return this.enqueue(tx, { entityType: v.entityType, entityId: v.entityId, branchId: v.branchId, priority: TALLY_PRIORITY.VOUCHER });
  }
}
