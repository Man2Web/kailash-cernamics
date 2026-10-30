import type { PrismaClient } from "@prisma/client";

/** Minimal masters + posted invoices created directly in the DB for accounts/Tally tests. */
export async function fixtures(prisma: PrismaClient, branchId: string) {
  const brand = await prisma.brand.create({ data: { name: `Kajaria ${Math.random().toString(36).slice(2, 6)}` } });
  const category = await prisma.category.create({ data: { name: `Floor ${Math.random().toString(36).slice(2, 6)}`, type: "TILE" } });
  const product = await prisma.product.create({
    data: { sku: `TL-${Math.random().toString(36).slice(2, 8)}`, name: "Calacatta Gold", brandId: brand.id, categoryId: category.id, hsn: "6907", gstRate: 18, uomType: "PIECE_BOX_AREA", pcsPerBox: 2, sqftPerBox: 15.5, mrpPaise: 248000n },
  });
  const customer = await prisma.party.create({ data: { type: "CUSTOMER", segment: "CONTRACTOR", name: "Sri Murugan Constructions", phone: "9876543210", stateCode: "33", creditDays: 30, creditLimitPaise: 50_000_000n } });
  const supplier = await prisma.party.create({ data: { type: "SUPPLIER", name: "Kajaria Ceramics Ltd", stateCode: "09" } });
  const influencer = await prisma.influencer.create({ data: { type: "ARCHITECT", name: "Ar. Priya", commissionPct: 2 } });
  return { brand, category, product, customer, supplier, influencer };
}

export async function postedInvoice(
  prisma: PrismaClient,
  o: { branchId: string; partyId: string; productId: string; number: string; daysAgo: number; totalPaise: number; influencerId?: string },
) {
  const date = new Date(Date.now() - o.daysAgo * 86_400_000);
  const taxable = Math.round(o.totalPaise / 1.18);
  return prisma.invoice.create({
    data: {
      branchId: o.branchId,
      number: o.number,
      date,
      partyId: o.partyId,
      placeOfSupply: "33",
      status: "POSTED",
      postedAt: date,
      influencerId: o.influencerId ?? null,
      taxablePaise: BigInt(taxable),
      cgstPaise: BigInt(Math.round((o.totalPaise - taxable) / 2)),
      sgstPaise: BigInt(o.totalPaise - taxable - Math.round((o.totalPaise - taxable) / 2)),
      totalPaise: BigInt(o.totalPaise),
      lines: { create: [{ productId: o.productId, hsn: "6907", qtyPcs: 10, ratePaise: BigInt(Math.round(taxable / 10)), gstRate: 18, taxablePaise: BigInt(taxable), amountPaise: BigInt(o.totalPaise) }] },
    },
  });
}
