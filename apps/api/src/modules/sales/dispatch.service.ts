import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { z } from "zod";
import { salesChallanSchema, salesDeliverSchema, salesDispatchSchema, weightKg } from "@gc/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../core/audit.service";
import { NumberingService } from "../../core/numbering.service";
import { stampCreate, stampUpdate } from "../../common/context";
import { productInclude } from "./sales.common";

export const challanInclude = {
  party: true,
  invoice: { select: { id: true, number: true, siteId: true, date: true } },
  lines: { where: { deletedAt: null }, include: { product: { include: productInclude }, batch: true } },
  dispatches: { where: { deletedAt: null }, orderBy: { dispatchedAt: "desc" as const }, include: { vehicle: true } },
};

/**
 * Delivery challans are raised against posted invoices (stock already left through the invoice), so
 * challans and dispatches don't move stock; they record what went on which vehicle and the proof of
 * delivery.
 */
@Injectable()
export class DispatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
  ) {}

  async get(id: string, branchId?: string) {
    const c = await this.prisma.deliveryChallan.findFirst({ where: { id, deletedAt: null, ...(branchId ? { branchId } : {}) }, include: challanInclude });
    if (!c) throw new NotFoundException("Challan not found");
    const site = c.siteId ? await this.prisma.site.findUnique({ where: { id: c.siteId } }) : null;
    // truck loading weight from box/unit weights
    const products = await this.prisma.product.findMany({
      where: { id: { in: c.lines.map((l) => l.productId) } },
      select: { id: true, uomType: true, pcsPerBox: true, weightPerBoxKg: true },
    });
    const lineWeights = c.lines.map((l) => {
      const p = products.find((x) => x.id === l.productId);
      return { lineId: l.id, weightKg: p ? Math.round(weightKg(l.qtyPcs, p) * 10) / 10 : 0 };
    });
    const totalWeightKg = Math.round(lineWeights.reduce((a, w) => a + w.weightKg, 0) * 10) / 10;
    return { ...c, site, lineWeights, totalWeightKg };
  }

  async create(branchId: string, input: z.infer<typeof salesChallanSchema>) {
    return this.prisma.tx(async (tx) => {
      const inv = await tx.invoice.findFirst({ where: { id: input.invoiceId, branchId, deletedAt: null }, include: { lines: { where: { deletedAt: null } } } });
      if (!inv) throw new NotFoundException("Invoice not found");
      if (inv.status !== "POSTED") throw new BadRequestException("Challans can only be made for posted invoices");
      const earlier = await tx.challanLine.findMany({ where: { deletedAt: null, challan: { invoiceId: inv.id, deletedAt: null, status: { not: "CANCELLED" } } } });
      const sent = (productId: string, batchId: string | null) =>
        earlier.filter((e) => e.productId === productId && e.batchId === batchId).reduce((a, e) => a + e.qtyPcs, 0);
      const wanted = input.lines?.length
        ? input.lines.map((l) => {
            const il = inv.lines.find((x) => x.id === l.invoiceLineId);
            if (!il) throw new BadRequestException("Line is not on this invoice");
            return { il, qty: l.qtyPcs };
          })
        : inv.lines.map((il) => ({ il, qty: il.qtyPcs - sent(il.productId, il.batchId) })).filter((x) => x.qty > 0);
      if (!wanted.length) throw new BadRequestException("Everything on this invoice is already on a challan");
      for (const w of wanted) {
        if (w.qty > w.il.qtyPcs - sent(w.il.productId, w.il.batchId)) throw new BadRequestException("Challan quantity is more than what is left to deliver");
      }
      const date = input.date ?? new Date();
      const number = await this.numbering.next(tx, branchId, "CHALLAN", date);
      const c = await tx.deliveryChallan.create({
        data: {
          branchId,
          number,
          date,
          invoiceId: inv.id,
          salesOrderId: inv.salesOrderId,
          partyId: inv.partyId,
          siteId: inv.siteId,
          notes: input.notes ?? null,
          status: "POSTED",
          ...stampCreate(),
          lines: { create: wanted.map((w) => ({ productId: w.il.productId, batchId: w.il.batchId, godownId: w.il.godownId, qtyPcs: w.qty, ...stampCreate() })) },
        },
        include: challanInclude,
      });
      await this.audit.log({ entity: "delivery_challan", entityId: c.id, action: "create", after: c }, tx);
      return c;
    });
  }

  async dispatch(challanId: string, branchId: string, input: z.infer<typeof salesDispatchSchema>) {
    return this.prisma.tx(async (tx) => {
      const c = await tx.deliveryChallan.findFirst({ where: { id: challanId, branchId, deletedAt: null } });
      if (!c) throw new NotFoundException("Challan not found");
      if (c.status === "CANCELLED") throw new BadRequestException("Challan is cancelled");
      let vehicleId = input.vehicleId ?? null;
      if (!vehicleId && input.vehicleNo) {
        const no = input.vehicleNo.toUpperCase().replace(/\s+/g, "");
        const v = await tx.vehicle.upsert({
          where: { number: no },
          create: { number: no, driverName: input.driverName ?? null, driverPhone: input.driverPhone ?? null, ...stampCreate() },
          update: {},
        });
        vehicleId = v.id;
      }
      const d = await tx.dispatch.create({
        data: {
          branchId,
          challanId,
          invoiceId: c.invoiceId,
          vehicleId,
          driverName: input.driverName ?? null,
          driverPhone: input.driverPhone ?? null,
          loadingPaise: BigInt(input.loadingPaise),
          unloadingPaise: BigInt(input.unloadingPaise),
          notes: input.notes ?? null,
          ...stampCreate(),
        },
        include: { vehicle: true },
      });
      await this.audit.log({ entity: "dispatch", entityId: d.id, action: "create", after: d }, tx);
      return d;
    });
  }

  async deliver(dispatchId: string, branchId: string, input: z.infer<typeof salesDeliverSchema>) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.dispatch.findFirst({ where: { id: dispatchId, branchId, deletedAt: null } });
      if (!before) throw new NotFoundException("Dispatch not found");
      const after = await tx.dispatch.update({
        where: { id: dispatchId },
        data: { deliveredAt: input.deliveredAt ?? new Date(), podPhoto: input.podPhoto ?? before.podPhoto, status: "COMPLETED", ...stampUpdate() },
      });
      if (before.challanId) await tx.deliveryChallan.update({ where: { id: before.challanId }, data: { status: "COMPLETED", ...stampUpdate() } });
      await this.audit.log({ entity: "dispatch", entityId: dispatchId, action: "deliver", before, after }, tx);
      return after;
    });
  }

  async cancel(id: string, branchId: string) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.deliveryChallan.findFirst({ where: { id, branchId, deletedAt: null } });
      if (!before) throw new NotFoundException("Challan not found");
      if (before.status === "COMPLETED") throw new BadRequestException("Delivered challans can't be cancelled");
      const after = await tx.deliveryChallan.update({ where: { id }, data: { status: "CANCELLED", ...stampUpdate() } });
      await this.audit.log({ entity: "delivery_challan", entityId: id, action: "cancel", before, after }, tx);
      return after;
    });
  }
}
