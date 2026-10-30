import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Product } from "@prisma/client";
import {
  formatINR,
  formatDate,
  salesAreaQty,
  salesAreaSqft,
  salesDefaultWastage,
  salesDocTotals,
  salesWhatsAppLink,
  splitBoxes,
  type SalesQuotationInput,
} from "@gc/shared";
import { PrismaService, Tx } from "../../prisma/prisma.service";
import { AuditService } from "../../core/audit.service";
import { NumberingService } from "../../core/numbering.service";
import { SettingsService } from "../../core/settings.service";
import { stampCreate, stampUpdate } from "../../common/context";
import { addDays, loadProducts, normaliseQty, productInclude, resolvePlace, spec } from "./sales.common";
import { OrderService } from "./order.service";

export const quotationInclude = {
  party: true,
  influencer: { select: { id: true, name: true, type: true } },
  branch: { include: { company: true } },
  rooms: {
    where: { deletedAt: null },
    orderBy: { sortOrder: "asc" as const },
    include: { areas: { where: { deletedAt: null }, include: { lines: { include: { product: { include: productInclude } } } } } },
  },
  lines: { where: { areaId: null, deletedAt: null }, orderBy: { sortOrder: "asc" as const }, include: { product: { include: productInclude } } },
};

/**
 * Room-wise quotations. The server recomputes areas, boxes, rates and GST from the inputs; client
 * totals are never trusted. Revisions keep the number and bump revisionNo; the superseded revision is
 * marked EXPIRED.
 */
@Injectable()
export class QuotationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly settings: SettingsService,
    private readonly orders: OrderService,
  ) {}

  async get(id: string, branchId?: string) {
    const q = await this.prisma.quotation.findFirst({ where: { id, deletedAt: null, ...(branchId ? { branchId } : {}) }, include: quotationInclude });
    if (!q) throw new NotFoundException("Quotation not found");
    const revisions = await this.prisma.quotation.findMany({
      where: { branchId: q.branchId, number: q.number, deletedAt: null },
      select: { id: true, revisionNo: true, status: true, totalPaise: true, createdAt: true },
      orderBy: { revisionNo: "asc" },
    });
    return { ...q, revisions };
  }

  async create(branchId: string, input: SalesQuotationInput) {
    return this.prisma.tx(async (tx) => {
      const date = input.date ?? new Date();
      const number = await this.numbering.next(tx, branchId, "QUOTATION", date);
      const q = await tx.quotation.create({
        data: { branchId, number, date, validUntil: date, placeOfSupply: "33", ...stampCreate() },
      });
      await this.write(tx, branchId, q.id, input);
      const after = await tx.quotation.findUniqueOrThrow({ where: { id: q.id }, include: quotationInclude });
      await this.audit.log({ entity: "quotation", entityId: q.id, action: "create", after }, tx);
      return after;
    });
  }

  async update(id: string, branchId: string, input: SalesQuotationInput) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.quotation.findFirst({ where: { id, branchId, deletedAt: null }, include: quotationInclude });
      if (!before) throw new NotFoundException("Quotation not found");
      if (before.status !== "DRAFT") throw new BadRequestException("Only draft quotations can be edited. Create a revision instead.");
      await this.write(tx, branchId, id, input);
      const after = await tx.quotation.findUniqueOrThrow({ where: { id }, include: quotationInclude });
      await this.audit.log({ entity: "quotation", entityId: id, action: "update", before, after }, tx);
      return after;
    });
  }

  /** (Re)write rooms, areas, lines and totals for a quotation from the input. */
  private async write(tx: Tx, branchId: string, id: string, input: SalesQuotationInput) {
    const all = await this.settings.all();
    const chargesRate = Number(all["charges.gstRate"] ?? 18);
    const validityDays = Number(all["quotation.validityDays"] ?? 15);
    const place = await resolvePlace(tx, branchId, input.partyId, input.placeOfSupply);
    const products = await loadProducts(tx, [...input.rooms.flatMap((r) => r.areas.map((a) => a.productId)), ...input.items.map((i) => i.productId)]);

    type Calc = {
      product: Product;
      roomIdx?: number;
      areaIdx?: number;
      reqSqft: number | null;
      boxes: number;
      loosePcs: number;
      line: { qtyPcs: number; priceBasis: string; enteredRatePaise: number; discountPct: number };
    };
    const calcs: Calc[] = [];
    const areaCalcs: { roomIdx: number; areaIdx: number; areaSqft: number; wastagePct: number }[] = [];
    input.rooms.forEach((room, ri) => {
      room.areas.forEach((area, ai) => {
        const p = products.get(area.productId)!;
        if (p.uomType !== "PIECE_BOX_AREA") throw new BadRequestException(`${p.name} is not a tile; add it as an item instead of a room area`);
        if (area.areaType === "WALL" && !room.heightFt && !area.areaSqft) throw new BadRequestException(`Enter the wall height for ${room.name}`);
        const areaSqft = salesAreaSqft(room, area.areaType, area.areaSqft);
        if (areaSqft <= 0) throw new BadRequestException(`Enter the ${area.areaType.toLowerCase()} area for ${room.name}`);
        const wastagePct = area.wastagePct ?? salesDefaultWastage(area.areaType, all);
        const qty = salesAreaQty(spec(p), areaSqft, wastagePct);
        areaCalcs.push({ roomIdx: ri, areaIdx: ai, areaSqft, wastagePct });
        calcs.push({
          product: p,
          roomIdx: ri,
          areaIdx: ai,
          reqSqft: areaSqft,
          boxes: qty.boxes,
          loosePcs: qty.loosePcs,
          line: { qtyPcs: qty.qtyPcs, priceBasis: area.priceBasis, enteredRatePaise: area.enteredRatePaise, discountPct: area.discountPct ?? 0 },
        });
      });
    });
    for (const it of input.items) {
      const p = products.get(it.productId)!;
      const qtyPcs = normaliseQty(p, it.qtyPcs);
      const { boxes, loose } = splitBoxes(qtyPcs, p.pcsPerBox ?? 0);
      calcs.push({
        product: p,
        reqSqft: null,
        boxes: p.pcsPerBox ? boxes : 0,
        loosePcs: p.pcsPerBox ? loose : qtyPcs,
        line: { qtyPcs, priceBasis: it.priceBasis, enteredRatePaise: it.enteredRatePaise, discountPct: it.discountPct ?? 0 },
      });
    }
    const totals = salesDocTotals(
      calcs.map((c) => ({ product: spec(c.product), line: c.line })),
      place.interState,
      input.transportPaise + input.loadingPaise,
      chargesRate,
    );

    await tx.quotationLine.deleteMany({ where: { quotationId: id } });
    await tx.quotationRoom.deleteMany({ where: { quotationId: id } });

    const date = input.date ?? new Date();
    await tx.quotation.update({
      where: { id },
      data: {
        partyId: input.partyId ?? null,
        customerName: input.customerName ?? place.party?.name ?? null,
        customerPhone: input.customerPhone ?? place.party?.phone ?? null,
        siteId: input.siteId ?? null,
        influencerId: input.influencerId ?? null,
        date,
        validUntil: input.validUntil ?? addDays(date, validityDays),
        placeOfSupply: place.placeOfSupply,
        notes: input.notes ?? null,
        transportPaise: BigInt(input.transportPaise),
        loadingPaise: BigInt(input.loadingPaise),
        subtotalPaise: BigInt(totals.subtotalPaise),
        discountPaise: BigInt(totals.discountPaise),
        taxablePaise: BigInt(totals.taxablePaise),
        cgstPaise: BigInt(totals.cgstPaise),
        sgstPaise: BigInt(totals.sgstPaise),
        igstPaise: BigInt(totals.igstPaise),
        roundOffPaise: BigInt(totals.roundOffPaise),
        totalPaise: BigInt(totals.totalPaise),
        ...stampUpdate(),
      },
    });

    const areaIds = new Map<string, string>();
    for (const [ri, room] of input.rooms.entries()) {
      const r = await tx.quotationRoom.create({
        data: {
          quotationId: id,
          name: room.name,
          lengthFt: room.lengthFt,
          widthFt: room.widthFt,
          heightFt: room.heightFt ?? null,
          deductionsSqft: room.deductionsSqft ?? 0,
          sortOrder: ri,
          ...stampCreate(),
        },
      });
      for (const [ai, area] of room.areas.entries()) {
        const ac = areaCalcs.find((a) => a.roomIdx === ri && a.areaIdx === ai)!;
        const a = await tx.quotationArea.create({
          data: { roomId: r.id, areaType: area.areaType, areaSqft: ac.areaSqft, wastagePct: ac.wastagePct, ...stampCreate() },
        });
        areaIds.set(`${ri}:${ai}`, a.id);
      }
    }
    for (const [i, c] of calcs.entries()) {
      const lt = totals.lines[i];
      await tx.quotationLine.create({
        data: {
          quotationId: id,
          areaId: c.roomIdx !== undefined ? areaIds.get(`${c.roomIdx}:${c.areaIdx}`)! : null,
          productId: c.product.id,
          reqSqft: c.reqSqft,
          boxes: c.boxes,
          loosePcs: c.loosePcs,
          qtyPcs: c.line.qtyPcs,
          priceBasis: c.line.priceBasis as never,
          enteredRatePaise: BigInt(c.line.enteredRatePaise),
          ratePaise: BigInt(totals.rates[i]),
          discountPct: c.line.discountPct,
          gstRate: c.product.gstRate,
          taxablePaise: BigInt(lt.taxablePaise),
          taxPaise: BigInt(lt.taxPaise),
          amountPaise: BigInt(lt.amountPaise),
          sortOrder: i,
          ...stampCreate(),
        },
      });
    }
  }

  /** Rebuild the input shape from a stored quotation (for revisions). */
  toInput(q: Awaited<ReturnType<QuotationService["get"]>>): SalesQuotationInput {
    return {
      partyId: q.partyId,
      customerName: q.customerName,
      customerPhone: q.customerPhone,
      siteId: q.siteId,
      influencerId: q.influencerId,
      date: new Date(),
      validUntil: null,
      placeOfSupply: q.placeOfSupply,
      notes: q.notes,
      transportPaise: Number(q.transportPaise),
      loadingPaise: Number(q.loadingPaise),
      rooms: q.rooms.map((r) => ({
        name: r.name,
        lengthFt: r.lengthFt,
        widthFt: r.widthFt,
        heightFt: r.heightFt,
        deductionsSqft: r.deductionsSqft,
        areas: r.areas.flatMap((a) =>
          a.lines.map((l) => ({
            areaType: a.areaType,
            wastagePct: a.wastagePct,
            areaSqft: a.areaType === "HIGHLIGHTER" ? a.areaSqft : null,
            productId: l.productId,
            priceBasis: l.priceBasis,
            enteredRatePaise: Number(l.enteredRatePaise),
            discountPct: l.discountPct,
          })),
        ),
      })),
      items: q.lines.map((l) => ({
        productId: l.productId,
        qtyPcs: l.qtyPcs,
        priceBasis: l.priceBasis,
        enteredRatePaise: Number(l.enteredRatePaise),
        discountPct: l.discountPct,
      })),
    };
  }

  async revise(id: string, branchId: string) {
    const q = await this.get(id, branchId);
    if (q.status === "CONVERTED") throw new BadRequestException("This quotation is already converted to an order");
    const latest = Math.max(...q.revisions.map((r) => r.revisionNo));
    if (q.revisionNo !== latest) throw new BadRequestException("Revise the latest revision");
    return this.prisma.tx(async (tx) => {
      const created = await tx.quotation.create({
        data: { branchId, number: q.number, revisionNo: q.revisionNo + 1, parentId: q.id, date: new Date(), validUntil: new Date(), placeOfSupply: q.placeOfSupply, ...stampCreate() },
      });
      await this.write(tx, branchId, created.id, this.toInput(q));
      await tx.quotation.update({ where: { id: q.id }, data: { status: "EXPIRED", ...stampUpdate() } });
      const after = await tx.quotation.findUniqueOrThrow({ where: { id: created.id }, include: quotationInclude });
      await this.audit.log({ entity: "quotation", entityId: created.id, action: "revise", before: { id: q.id, revisionNo: q.revisionNo }, after }, tx);
      return after;
    });
  }

  async setStatus(id: string, branchId: string, status: "SENT" | "ACCEPTED" | "REJECTED") {
    return this.prisma.tx(async (tx) => {
      const before = await tx.quotation.findFirst({ where: { id, branchId, deletedAt: null } });
      if (!before) throw new NotFoundException("Quotation not found");
      if (["CONVERTED", "EXPIRED"].includes(before.status)) throw new BadRequestException(`Quotation is ${before.status.toLowerCase()}`);
      const after = await tx.quotation.update({ where: { id }, data: { status, ...stampUpdate() } });
      await this.audit.log({ entity: "quotation", entityId: id, action: `status:${status}`, before, after }, tx);
      return after;
    });
  }

  async share(id: string, branchId: string) {
    const q = await this.get(id, branchId);
    const base = process.env.APP_URL || "http://localhost:3000";
    const printUrl = `${base}/print/quotation/${q.id}`;
    const name = q.party?.name ?? q.customerName ?? "Sir/Madam";
    const text = [
      `Dear ${name},`,
      `Thank you for visiting ${q.branch.company.name}. Please find your quotation ${q.number}${q.revisionNo > 1 ? ` (Rev ${q.revisionNo})` : ""} for ${formatINR(q.totalPaise)}, valid till ${formatDate(q.validUntil)}.`,
      printUrl,
    ].join("\n");
    const phone = q.party?.phone ?? q.customerPhone;
    return { text, printUrl, whatsappUrl: salesWhatsAppLink(phone, text), phone };
  }

  /** One click quote → sales order, keeping prices. The order starts as a draft to pick batches. */
  async convert(id: string, branchId: string) {
    const q = await this.get(id, branchId);
    if (q.status === "CONVERTED") throw new BadRequestException("Already converted");
    if (q.status === "EXPIRED" || q.status === "REJECTED") throw new BadRequestException(`Quotation is ${q.status.toLowerCase()}`);
    if (!q.partyId) throw new BadRequestException("Pick a customer on the quotation before converting");
    const lines = [...q.rooms.flatMap((r) => r.areas.flatMap((a) => a.lines)), ...q.lines];
    return this.prisma.tx(async (tx) => {
      const order = await this.orders.createInTx(tx, branchId, {
        partyId: q.partyId!,
        siteId: q.siteId,
        influencerId: q.influencerId,
        quotationId: q.id,
        placeOfSupply: q.placeOfSupply,
        notes: q.notes,
        transportPaise: Number(q.transportPaise),
        loadingPaise: Number(q.loadingPaise),
        confirm: false,
        lines: lines.map((l) => ({
          productId: l.productId,
          qtyPcs: l.qtyPcs,
          priceBasis: l.priceBasis,
          enteredRatePaise: Number(l.enteredRatePaise),
          discountPct: l.discountPct,
        })),
      });
      await tx.quotation.update({ where: { id: q.id }, data: { status: "CONVERTED", salesOrderId: order.id, ...stampUpdate() } });
      await this.audit.log({ entity: "quotation", entityId: q.id, action: "convert", after: { salesOrderId: order.id } }, tx);
      return order;
    });
  }
}
