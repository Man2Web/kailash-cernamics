import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import {
  cataloguePriceItemsUpsertSchema,
  cataloguePriceLookupSchema,
  listQuerySchema,
  priceListSchema,
  ratePerBoxToPerPiece,
  toPerPieceRate,
} from "@gc/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../core/audit.service";
import { Perm } from "../../common/decorators";
import { ZodPipe } from "../../common/zod.pipe";
import { paginate, pickFilters, searchWhere } from "../../common/pagination";
import { stampCreate, stampUpdate } from "../../common/context";

export interface PriceLookup {
  productId: string;
  segment: string;
  priceBasis: "PER_SQFT" | "PER_BOX" | "PER_UNIT";
  pricePaise: number;
  ratePerPiecePaise: number;
  priceListId: string | null;
  priceListName: string | null;
  source: "PRICE_LIST" | "MRP";
}

@Controller()
export class PricesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get("price-lists")
  @Perm("price.read")
  async list(@Query(new ZodPipe(listQuerySchema.extend({ segment: z.string().optional(), isActive: z.string().optional() }))) q: any) {
    const page = await paginate<any>(this.prisma.priceList, q, {
      where: { deletedAt: null, ...searchWhere(q.q, ["name"]), ...pickFilters(q, ["segment", "isActive"]) },
      include: { _count: { select: { items: { where: { deletedAt: null } } } } },
      orderBy: { name: "asc" },
    });
    page.items = page.items.map((r: any) => ({ ...r, itemCount: r._count?.items ?? 0 }));
    return page;
  }

  @Get("price-lists/:id")
  @Perm("price.read")
  async get(@Param("id") id: string) {
    const pl = await this.prisma.priceList.findFirst({ where: { id, deletedAt: null } });
    if (!pl) throw new NotFoundException();
    return pl;
  }

  @Post("price-lists")
  @Perm("price.write")
  async create(@Body(new ZodPipe(priceListSchema)) body: z.infer<typeof priceListSchema>) {
    return this.prisma.tx(async (tx) => {
      const row = await tx.priceList.create({ data: { ...body, ...stampCreate() } });
      await this.audit.log({ entity: "price_list", entityId: row.id, action: "create", after: row }, tx);
      return row;
    });
  }

  @Patch("price-lists/:id")
  @Perm("price.write")
  async update(@Param("id") id: string, @Body(new ZodPipe(priceListSchema.partial())) body: any) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.priceList.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundException();
      const after = await tx.priceList.update({ where: { id }, data: { ...body, ...stampUpdate() } });
      await this.audit.log({ entity: "price_list", entityId: id, action: "update", before, after }, tx);
      return after;
    });
  }

  @Delete("price-lists/:id")
  @Perm("price.write")
  async remove(@Param("id") id: string) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.priceList.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundException();
      await tx.priceList.update({ where: { id }, data: { deletedAt: new Date(), ...stampUpdate() } });
      await this.audit.log({ entity: "price_list", entityId: id, action: "delete", before }, tx);
      return { ok: true };
    });
  }

  /** Current item per product (latest validFrom ≤ now). */
  @Get("price-lists/:id/items")
  @Perm("price.read")
  async items(@Param("id") id: string, @Query(new ZodPipe(listQuerySchema)) q: any) {
    return paginate(this.prisma.priceListItem, { ...q, pageSize: q.pageSize ?? 100 }, {
      where: { priceListId: id, deletedAt: null, ...searchWhere(q.q, ["product.sku", "product.name", "product.brand.name"]) },
      include: {
        product: { select: { id: true, sku: true, name: true, uomType: true, pcsPerBox: true, sqftPerBox: true, mrpPaise: true, brand: { select: { name: true } } } },
      },
      orderBy: [{ product: { name: "asc" } }, { validFrom: "desc" }],
    });
  }

  /** Upsert items: a new validFrom creates a new price row (history kept); same day overwrites. */
  @Post("price-lists/:id/items")
  @Perm("price.write")
  async upsertItems(@Param("id") id: string, @Body(new ZodPipe(cataloguePriceItemsUpsertSchema)) body: z.infer<typeof cataloguePriceItemsUpsertSchema>) {
    return this.prisma.tx(async (tx) => {
      const pl = await tx.priceList.findFirst({ where: { id, deletedAt: null } });
      if (!pl) throw new NotFoundException();
      const out = [];
      for (const it of body.items) {
        const validFrom = it.validFrom ?? new Date();
        const dayStart = new Date(validFrom);
        dayStart.setUTCHours(0, 0, 0, 0);
        const existing = await tx.priceListItem.findFirst({
          where: { priceListId: id, productId: it.productId, deletedAt: null, validFrom: { gte: dayStart, lt: new Date(dayStart.getTime() + 86400000) } },
        });
        const row = existing
          ? await tx.priceListItem.update({ where: { id: existing.id }, data: { priceBasis: it.priceBasis, pricePaise: BigInt(it.pricePaise), ...stampUpdate() } })
          : await tx.priceListItem.create({
              data: { priceListId: id, productId: it.productId, priceBasis: it.priceBasis, pricePaise: BigInt(it.pricePaise), validFrom, ...stampCreate() },
            });
        await this.audit.log({ entity: "price_list_item", entityId: row.id, action: existing ? "update" : "create", before: existing, after: row }, tx);
        out.push(row);
      }
      return out;
    });
  }

  @Delete("price-list-items/:id")
  @Perm("price.write")
  async removeItem(@Param("id") id: string) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.priceListItem.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundException();
      await tx.priceListItem.update({ where: { id }, data: { deletedAt: new Date(), ...stampUpdate() } });
      await this.audit.log({ entity: "price_list_item", entityId: id, action: "delete", before }, tx);
      return { ok: true };
    });
  }

  /**
   * Price for a product in the customer's segment price list (latest valid item), falling back to
   * MRP (per box for tiles → per piece). Used by quotation/order/invoice screens.
   */
  @Get("prices/lookup")
  @Perm("sales.read")
  async lookup(@Query(new ZodPipe(cataloguePriceLookupSchema)) q: z.infer<typeof cataloguePriceLookupSchema>): Promise<PriceLookup> {
    const product = await this.prisma.product.findFirst({ where: { id: q.productId, deletedAt: null } });
    if (!product) throw new NotFoundException("Product not found");
    let segment: string = q.segment ?? "RETAIL";
    if (q.partyId) {
      const party = await this.prisma.party.findFirst({ where: { id: q.partyId, deletedAt: null }, select: { segment: true } });
      if (!party) throw new BadRequestException("Customer not found");
      segment = party.segment;
    }
    const item = await this.prisma.priceListItem.findFirst({
      where: { productId: product.id, deletedAt: null, validFrom: { lte: new Date() }, priceList: { segment: segment as never, isActive: true, deletedAt: null } },
      include: { priceList: { select: { id: true, name: true } } },
      orderBy: { validFrom: "desc" },
    });
    const spec = { pcsPerBox: product.pcsPerBox, sqftPerBox: product.sqftPerBox };
    if (item) {
      const pricePaise = Number(item.pricePaise);
      return {
        productId: product.id,
        segment,
        priceBasis: item.priceBasis,
        pricePaise,
        ratePerPiecePaise: toPerPieceRate(pricePaise, item.priceBasis, spec),
        priceListId: item.priceList.id,
        priceListName: item.priceList.name,
        source: "PRICE_LIST",
      };
    }
    const mrp = Number(product.mrpPaise);
    const tile = product.uomType === "PIECE_BOX_AREA";
    return {
      productId: product.id,
      segment,
      priceBasis: tile ? "PER_BOX" : "PER_UNIT",
      pricePaise: mrp,
      ratePerPiecePaise: tile ? ratePerBoxToPerPiece(mrp, product.pcsPerBox) : mrp,
      priceListId: null,
      priceListName: null,
      source: "MRP",
    };
  }
}
