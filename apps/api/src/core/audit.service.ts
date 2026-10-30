import { Injectable } from "@nestjs/common";
import { PrismaService, Tx } from "../prisma/prisma.service";
import { ctx } from "../common/context";

function plain(v: unknown) {
  if (v === undefined || v === null) return undefined;
  return JSON.parse(JSON.stringify(v));
}

/** Every mutation writes an audit_log row (who, what, before, after). */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(
    entry: { entity: string; entityId: string; action: string; before?: unknown; after?: unknown },
    tx?: Tx,
  ) {
    const c = ctx();
    const db = tx ?? this.prisma;
    await db.auditLog.create({
      data: {
        userId: c.user?.id ?? null,
        branchId: c.branchId ?? null,
        ip: c.ip ?? null,
        entity: entry.entity,
        entityId: entry.entityId,
        action: entry.action,
        before: plain(entry.before),
        after: plain(entry.after),
      },
    });
  }
}
