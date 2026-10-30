import { Body, Controller, Post } from "@nestjs/common";
import { z } from "zod";
import {
  CATEGORY_TYPES,
  catalogueImportSchema,
  labelOf,
  PARTY_TYPES,
  partiesPartySchema,
  productSchema,
  rupeesToPaise,
  SEGMENTS,
  stateCodeFromGstin,
} from "@gc/shared";
import { PrismaService, Tx } from "../../prisma/prisma.service";
import { AuditService } from "../../core/audit.service";
import { Perm } from "../../common/decorators";
import { ZodPipe } from "../../common/zod.pipe";
import { stampCreate, stampUpdate } from "../../common/context";

type Row = Record<string, unknown>;
type Body = z.infer<typeof catalogueImportSchema>;

export interface ImportRowResult {
  row: number;
  key: string;
  action: "create" | "update" | "error";
  errors: string[];
  notes: string[];
}

const s = (v: unknown) => (v === undefined || v === null ? "" : String(v).trim());
const bool = (v: unknown) => /^(true|yes|y|1)$/i.test(s(v));
const num = (v: unknown) => (s(v) === "" ? null : Number(s(v)));

/** Bulk import with a validation preview (docs/client/templates/*.csv). Preview never writes. */
@Controller("import")
export class ImportController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------- products
  private async resolveProduct(db: Tx | PrismaService, r: Row, create: boolean) {
    const notes: string[] = [];
    const errors: string[] = [];
    const findOrCreate = async (model: "brand" | "series" | "finish" | "color", name: string, extra: Record<string, unknown> = {}) => {
      if (!name) return null;
      const d = (db as any)[model];
      const found = await d.findFirst({ where: { name: { equals: name, mode: "insensitive" }, deletedAt: null } });
      if (found) return found.id as string;
      notes.push(`New ${model} "${name}"`);
      if (!create) return `new:${name}`;
      return (await d.create({ data: { name, ...extra, ...stampCreate() } })).id as string;
    };

    const type = s(r.category_type).toUpperCase() || "TILE";
    if (!(CATEGORY_TYPES as readonly string[]).includes(type)) errors.push(`category_type must be one of ${CATEGORY_TYPES.join(", ")}`);
    let categoryId: string | null = null;
    if (!errors.length) {
      const cat = await db.category.findFirst({ where: { type: type as never, deletedAt: null }, orderBy: { createdAt: "asc" } });
      if (cat) categoryId = cat.id;
      else {
        notes.push(`New category "${labelOf(type)}"`);
        categoryId = create ? (await db.category.create({ data: { name: labelOf(type), type: type as never, ...stampCreate() } })).id : "new:cat";
      }
    }
    const brandId = await findOrCreate("brand", s(r.brand));
    if (!brandId) errors.push("brand is required");
    const seriesId = await findOrCreate("series", s(r.series), brandId && !brandId.startsWith("new:") ? { brandId } : {});
    const finishId = await findOrCreate("finish", s(r.finish));
    const colorId = await findOrCreate("color", s(r.color));
    let sizeId: string | null = null;
    const sizeName = s(r.size_mm).toLowerCase().replace(/\s/g, "");
    if (sizeName) {
      const m = /^(\d+)x(\d+)(?:x([\d.]+))?$/.exec(sizeName);
      if (!m) errors.push(`size_mm "${s(r.size_mm)}" should look like 600x1200`);
      else {
        const name = `${m[1]}x${m[2]}`;
        const found = await db.size.findFirst({ where: { name, deletedAt: null } });
        if (found) sizeId = found.id;
        else {
          notes.push(`New size "${name}"`);
          sizeId = create
            ? (await db.size.create({ data: { name, lengthMm: Number(m[1]), widthMm: Number(m[2]), thicknessMm: m[3] ? Number(m[3]) : null, ...stampCreate() } })).id
            : "new:size";
        }
      }
    }
    const uomType = s(r.uom_type).toUpperCase() || (type === "TILE" ? "PIECE_BOX_AREA" : "UNIT");
    const tile = uomType === "PIECE_BOX_AREA";
    const pcsPerBox = num(r.pcs_per_box);
    let mrpPaise = 0;
    try {
      mrpPaise = rupeesToPaise(s(tile ? r.mrp_per_box : r.mrp_per_unit) || s(r.mrp_per_box) || s(r.mrp_per_unit) || "0");
    } catch {
      errors.push("MRP is not a valid amount");
    }
    const candidate = {
      sku: s(r.sku),
      name: s(r.name),
      brandId: brandId ?? "",
      categoryId: categoryId ?? "",
      seriesId,
      sizeId,
      finishId,
      colorId,
      hsn: s(r.hsn),
      gstRate: num(r.gst_rate) ?? 18,
      uomType,
      unitName: tile ? "pcs" : s(r.unit) || "nos",
      pcsPerBox,
      sqftPerBox: num(r.sqft_per_box),
      weightPerBoxKg: num(r.weight_per_box_kg),
      mrpPaise,
      allowLooseSale: bool(r.allow_loose_sale),
      images: [],
      isActive: true,
      reorderLevelPcs: num(r.reorder_level_pcs) ?? (tile && pcsPerBox ? pcsPerBox * 20 : 5),
    };
    const parsed = productSchema.safeParse(candidate);
    if (!parsed.success) for (const i of parsed.error.issues) errors.push(`${i.path.join(".") || "row"}: ${i.message}`);
    return { data: parsed.success ? parsed.data : null, errors, notes };
  }

  @Post("products/preview")
  @Perm("catalogue.write")
  async previewProducts(@Body(new ZodPipe(catalogueImportSchema)) body: Body) {
    const results: ImportRowResult[] = [];
    const seen = new Set<string>();
    for (const [i, r] of body.rows.entries()) {
      const { errors, notes } = await this.resolveProduct(this.prisma, r, false);
      const sku = s(r.sku).toUpperCase();
      if (seen.has(sku)) errors.push("Duplicate SKU in file");
      seen.add(sku);
      const existing = sku ? await this.prisma.product.findUnique({ where: { sku } }) : null;
      results.push({ row: i + 2, key: sku, action: errors.length ? "error" : existing ? "update" : "create", errors, notes });
    }
    return summary(results);
  }

  @Post("products/commit")
  @Perm("catalogue.write")
  async commitProducts(@Body(new ZodPipe(catalogueImportSchema)) body: Body) {
    const preview = await this.previewProducts(body);
    if (preview.errorCount) return { ...preview, committed: false };
    await this.prisma.$transaction(
      async (tx) => {
        for (const r of body.rows) {
          const { data } = await this.resolveProduct(tx, r, true);
          if (!data) continue;
          const sku = data.sku.toUpperCase();
          const values = {
            ...data,
            sku,
            mrpPaise: BigInt(data.mrpPaise),
            sqmPerBox: data.sqftPerBox ? Math.round((data.sqftPerBox / 10.7639) * 10000) / 10000 : null,
          };
          const before = await tx.product.findUnique({ where: { sku } });
          const row = before
            ? await tx.product.update({ where: { sku }, data: { ...values, images: before.images, deletedAt: null, ...stampUpdate() } })
            : await tx.product.create({ data: { ...values, ...stampCreate() } });
          await this.audit.log({ entity: "product", entityId: row.id, action: before ? "import_update" : "import_create", before, after: row }, tx);
        }
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
    return { ...preview, committed: true };
  }

  // ------------------------------------------------------------- parties
  private partyCandidate(r: Row) {
    const errors: string[] = [];
    const gstin = s(r.gstin).toUpperCase();
    const money = (v: unknown, label: string) => {
      try {
        return rupeesToPaise(s(v) || "0");
      } catch {
        errors.push(`${label} is not a valid amount`);
        return 0;
      }
    };
    const type = s(r.type).toUpperCase() || "CUSTOMER";
    const segment = s(r.segment).toUpperCase() || "RETAIL";
    if (!(PARTY_TYPES as readonly string[]).includes(type)) errors.push(`type must be one of ${PARTY_TYPES.join(", ")}`);
    if (!(SEGMENTS as readonly string[]).includes(segment)) errors.push(`segment must be one of ${SEGMENTS.join(", ")}`);
    const candidate = {
      type,
      segment,
      name: s(r.name),
      phone: s(r.phone) || null,
      email: s(r.email) || null,
      gstin: gstin || null,
      stateCode: (s(r.state_code) || stateCodeFromGstin(gstin) || "33").padStart(2, "0"),
      city: s(r.city) || null,
      billingAddress: s(r.billing_address) || null,
      creditLimitPaise: money(r.credit_limit, "credit_limit"),
      creditDays: Number(s(r.credit_days) || 0),
      openingBalancePaise: money(r.opening_balance, "opening_balance"),
      isActive: true,
    };
    const parsed = partiesPartySchema.safeParse(candidate);
    if (!parsed.success) for (const i of parsed.error.issues) errors.push(`${i.path.join(".") || "row"}: ${i.message}`);
    return { data: parsed.success && !errors.length ? parsed.data : null, errors };
  }

  private async findParty(db: Tx | PrismaService, d: { name: string; phone?: string | null; gstin?: string | null }) {
    if (d.gstin) {
      const g = await db.party.findFirst({ where: { gstin: d.gstin, deletedAt: null } });
      if (g) return g;
    }
    return db.party.findFirst({ where: { name: { equals: d.name, mode: "insensitive" }, ...(d.phone ? { phone: d.phone } : {}), deletedAt: null } });
  }

  @Post("parties/preview")
  @Perm("party.write")
  async previewParties(@Body(new ZodPipe(catalogueImportSchema)) body: Body) {
    const results: ImportRowResult[] = [];
    for (const [i, r] of body.rows.entries()) {
      const { data, errors } = this.partyCandidate(r);
      const existing = data ? await this.findParty(this.prisma, data) : null;
      results.push({ row: i + 2, key: s(r.name), action: errors.length ? "error" : existing ? "update" : "create", errors, notes: [] });
    }
    return summary(results);
  }

  @Post("parties/commit")
  @Perm("party.write")
  async commitParties(@Body(new ZodPipe(catalogueImportSchema)) body: Body) {
    const preview = await this.previewParties(body);
    if (preview.errorCount) return { ...preview, committed: false };
    await this.prisma.$transaction(
      async (tx) => {
        for (const r of body.rows) {
          const { data } = this.partyCandidate(r);
          if (!data) continue;
          const values = {
            ...data,
            email: data.email || null,
            gstin: data.gstin || null,
            creditLimitPaise: BigInt(data.creditLimitPaise),
            openingBalancePaise: BigInt(data.openingBalancePaise),
          };
          const before = await this.findParty(tx, data);
          const row = before
            ? await tx.party.update({ where: { id: before.id }, data: { ...values, ...stampUpdate() } })
            : await tx.party.create({ data: { ...values, ...stampCreate() } });
          await this.audit.log({ entity: "party", entityId: row.id, action: before ? "import_update" : "import_create", before, after: row }, tx);
        }
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
    return { ...preview, committed: true };
  }
}

function summary(results: ImportRowResult[]) {
  return {
    total: results.length,
    createCount: results.filter((r) => r.action === "create").length,
    updateCount: results.filter((r) => r.action === "update").length,
    errorCount: results.filter((r) => r.action === "error").length,
    results,
  };
}
