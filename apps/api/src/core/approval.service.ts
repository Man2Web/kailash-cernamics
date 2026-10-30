import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ApprovalRequest, ApprovalType } from "@prisma/client";
import { PrismaService, Tx } from "../prisma/prisma.service";
import { AuditService } from "./audit.service";
import { ctx, stampCreate } from "../common/context";

type Handler = (tx: Tx, request: ApprovalRequest, approved: boolean) => Promise<void>;

const PERM_FOR_TYPE: Record<ApprovalType, string> = {
  DISCOUNT: "approval.discount",
  CREDIT: "approval.credit",
  ADJUSTMENT: "approval.stock",
  WRITE_OFF: "approval.stock",
};

/**
 * Approval requests (discount over role limit, credit hold, stock adjustment, write-off).
 * Modules register a handler per refType that applies the decision to their document.
 */
@Injectable()
export class ApprovalService {
  private handlers = new Map<string, Handler>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  registerHandler(refType: string, handler: Handler) {
    this.handlers.set(refType, handler);
  }

  async request(
    tx: Tx,
    r: { type: ApprovalType; refType: string; refId: string; reason: string; payload?: unknown; branchId?: string | null; link?: string },
  ) {
    const userId = ctx().user?.id;
    if (!userId) throw new ForbiddenException();
    const existing = await tx.approvalRequest.findFirst({
      where: { refType: r.refType, refId: r.refId, type: r.type, status: "PENDING", deletedAt: null },
    });
    if (existing) return existing;
    const req = await tx.approvalRequest.create({
      data: {
        type: r.type,
        refType: r.refType,
        refId: r.refId,
        reason: r.reason,
        payload: r.payload === undefined ? undefined : JSON.parse(JSON.stringify(r.payload)),
        branchId: r.branchId ?? ctx().branchId ?? null,
        requestedById: userId,
        ...stampCreate(),
      },
    });
    // notify everyone who can approve this type (in-app; WhatsApp goes through the worker in Phase 7)
    const approvers = await tx.user.findMany({
      where: { isActive: true, deletedAt: null, role: { permissions: { some: { permission: { code: PERM_FOR_TYPE[r.type] } } } } },
      select: { id: true },
    });
    if (approvers.length) {
      await tx.notification.createMany({
        data: approvers.map((a) => ({
          userId: a.id,
          type: "APPROVAL",
          title: `Approval needed: ${r.type.toLowerCase().replace("_", " ")}`,
          body: r.reason,
          link: r.link ?? "/approvals",
        })),
      });
    }
    await this.audit.log({ entity: "approval_request", entityId: req.id, action: "request", after: req }, tx);
    return req;
  }

  async decide(id: string, approve: boolean, note?: string) {
    const user = ctx().user;
    if (!user) throw new ForbiddenException();
    return this.prisma.tx(async (tx) => {
      const req = await tx.approvalRequest.findUnique({ where: { id } });
      if (!req || req.deletedAt) throw new NotFoundException("Approval request not found");
      if (req.status !== "PENDING") throw new BadRequestException("This request is already decided");
      if (!user.permissions.has(PERM_FOR_TYPE[req.type])) throw new ForbiddenException("You cannot decide this approval");
      const updated = await tx.approvalRequest.update({
        where: { id },
        data: { status: approve ? "APPROVED" : "REJECTED", decidedById: user.id, decidedAt: new Date(), decisionNote: note ?? null, updatedBy: user.id },
      });
      const handler = this.handlers.get(req.refType);
      if (handler) await handler(tx, updated, approve);
      await tx.notification.create({
        data: {
          userId: req.requestedById,
          type: "APPROVAL_DECIDED",
          title: `${req.type.toLowerCase().replace("_", " ")} request ${approve ? "approved" : "rejected"}`,
          body: note ?? req.reason,
          link: "/approvals",
        },
      });
      await this.audit.log({ entity: "approval_request", entityId: id, action: approve ? "approve" : "reject", before: req, after: updated }, tx);
      return updated;
    });
  }
}
