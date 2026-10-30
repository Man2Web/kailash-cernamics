import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import {
  catalogueVariantUpdateSchema,
  listQuerySchema,
  productSchema,
  productVariantSchema,
  SQFT_PER_SQM,
  type ProductInput,
} from "@gc/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../core/audit.service";
import { Perm } from "../../common/decorators";
import { ZodPipe } from "../../common/zod.pipe";
import { paginate, pickFilters, searchWhere } from "../../common/pagination";
import { stampCreate, stampUpdate } from "../../common/context";

export const productInclude = {
  brand: { select: { id: true, name: true } },
  category: { select: { id: true, name: true, type: true } },
  series: { select: { id: true, name: true } },
  size: { select: { id: true, name: true } },
  finish: { select: { id: true, name: true } },
  color: { select: { id: true, name: true, hex: true } },
} as const;

/** Normalise a validated product: tiles keep box fields, unit items drop them; sqm derived from sqft. */
function productData(p: ProductInput) {
  const tile = p.uomType === "PIECE_BOX_AREA";
  return {
    ...p,
    sku: p.sku.toUpperCase(),
    seriesId: p.seriesId || null,
    sizeId: p.sizeId || null,
    finishId: p.finishId || null,
    colorId: p.colorId || null,
    pcsPerBox: tile ? p.pcsPerBox : null,
    sqftPerBox: tile ? p.sqftPerBox : null,
    sqmPerBox: tile && p.sqftPerBox ? Math.round((p.sqftPerBox / SQFT_PER_SQM) * 10000) / 10000 : null,
    weightPerBoxKg: p.weightPerBoxKg ?? null,
    allowLooseSale: tile ? p.allowLooseSale : true,
    mrpPaise: BigInt(p.mrpPaise ?? 0),
    unitName: tile ? "pcs" : p.unitName || "nos",
    description: p.description ?? null,
    applications: tile ? p.applications ?? [] : [],
    leadTimeDays: p.leadTimeDays ?? null,
    safetyStockDays: p.safetyStockDays ?? 7,
  };
}

const listSchema = listQuerySchema.extend({
  brandId: z.string().optional(),
  categoryId: z.string().optional(),
  sizeId: z.string().optional(),
  uomType: z.string().optional(),
  isActive: z.string().optional(),
  categoryType: z.string().optional(),
  application: z.string().optional(),
});

@Controller()
export class ProductsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get("products")
  @Perm("catalogue.read")
  list(@Query(new ZodPipe(listSchema)) q: z.infer<typeof listSchema>) {
    return paginate(this.prisma.product, q, {
      where: {
        deletedAt: null,
        ...searchWhere(q.q, ["sku", "name", "brand.name", "series.name", "size.name"]),
        ...pickFilters(q, ["brandId", "categoryId", "sizeId", "uomType", "isActive"]),
        ...(q.categoryType ? { category: { type: q.categoryType } } : {}),
        ...(q.application ? { applications: { has: q.application } } : {}),
      },
      include: productInclude,
      orderBy: { name: "asc" },
    });
  }

  @Get("products/:id")
  @Perm("catalogue.read")
  async get(@Param("id") id: string) {
    const p = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: { ...productInclude, variants: { where: { deletedAt: null }, include: { color: true }, orderBy: { skuSuffix: "asc" } } },
    });
    if (!p) throw new NotFoundException("Product not found");
    return p;
  }

  @Post("products")
  @Perm("catalogue.write")
  async create(@Body(new ZodPipe(productSchema)) body: ProductInput) {
    return this.prisma.tx(async (tx) => {
      const row = await tx.product.create({ data: { ...productData(body), ...stampCreate() }, include: productInclude });
      await this.audit.log({ entity: "product", entityId: row.id, action: "create", after: row }, tx);
      return row;
    });
  }

  /** Full update: the form always sends the whole product, validated with the same rules as create. */
  @Patch("products/:id")
  @Perm("catalogue.write")
  async update(@Param("id") id: string, @Body() raw: Record<string, unknown>) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.product.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundException("Product not found");
      const merged = { ...JSON.parse(JSON.stringify(before)), ...raw };
      const body = new ZodPipe(productSchema).transform(merged);
      const after = await tx.product.update({ where: { id }, data: { ...productData(body), ...stampUpdate() }, include: productInclude });
      await this.audit.log({ entity: "product", entityId: id, action: "update", before, after }, tx);
      return after;
    });
  }

  @Delete("products/:id")
  @Perm("catalogue.write")
  async remove(@Param("id") id: string) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.product.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundException();
      const stock = await tx.stockBalance.aggregate({ where: { productId: id }, _sum: { qtyPcs: true } });
      if ((stock._sum.qtyPcs ?? 0) !== 0) throw new BadRequestException("Product still has stock; mark it inactive instead");
      await tx.product.update({ where: { id }, data: { deletedAt: new Date(), isActive: false, ...stampUpdate() } });
      await this.audit.log({ entity: "product", entityId: id, action: "delete", before }, tx);
      return { ok: true };
    });
  }

  // ---- variants (sanitary colours)
  @Get("product-variants")
  @Perm("catalogue.read")
  variants(@Query(new ZodPipe(listQuerySchema.extend({ productId: z.string().optional() }))) q: any) {
    return paginate(this.prisma.productVariant, q, {
      where: { deletedAt: null, ...pickFilters(q, ["productId"]), ...searchWhere(q.q, ["skuSuffix", "name"]) },
      include: { color: true },
      orderBy: { skuSuffix: "asc" },
    });
  }

  @Post("product-variants")
  @Perm("catalogue.write")
  async createVariant(@Body(new ZodPipe(productVariantSchema)) body: z.infer<typeof productVariantSchema>) {
    return this.prisma.tx(async (tx) => {
      const row = await tx.productVariant.create({
        data: { ...body, skuSuffix: body.skuSuffix.toUpperCase(), mrpPaise: body.mrpPaise == null ? null : BigInt(body.mrpPaise), ...stampCreate() },
        include: { color: true },
      });
      await this.audit.log({ entity: "product_variant", entityId: row.id, action: "create", after: row }, tx);
      return row;
    });
  }

  @Patch("product-variants/:id")
  @Perm("catalogue.write")
  async updateVariant(@Param("id") id: string, @Body(new ZodPipe(catalogueVariantUpdateSchema)) body: z.infer<typeof catalogueVariantUpdateSchema>) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.productVariant.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundException();
      const after = await tx.productVariant.update({
        where: { id },
        data: { ...body, ...(body.mrpPaise !== undefined ? { mrpPaise: body.mrpPaise == null ? null : BigInt(body.mrpPaise) } : {}), ...stampUpdate() },
      });
      await this.audit.log({ entity: "product_variant", entityId: id, action: "update", before, after }, tx);
      return after;
    });
  }

  @Delete("product-variants/:id")
  @Perm("catalogue.write")
  async removeVariant(@Param("id") id: string) {
    return this.prisma.tx(async (tx) => {
      const before = await tx.productVariant.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundException();
      await tx.productVariant.update({ where: { id }, data: { deletedAt: new Date(), ...stampUpdate() } });
      await this.audit.log({ entity: "product_variant", entityId: id, action: "delete", before }, tx);
      return { ok: true };
    });
  }
}
