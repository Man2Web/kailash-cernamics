import type { PrismaClient } from "@prisma/client";

/** Brand, categories, a tile (8 pcs/box, 15.5 sq ft/box), a sanitary item and a supplier. */
export async function inventoryFixtures(prisma: PrismaClient) {
  const brand = await prisma.brand.create({ data: { name: "Kajaria" } });
  const tiles = await prisma.category.create({ data: { name: "Floor tiles", type: "TILE" } });
  const sanitary = await prisma.category.create({ data: { name: "WC", type: "SANITARY" } });
  const tile = await prisma.product.create({
    data: {
      sku: "TL-KJ-3060-WD",
      name: "Wood Strip Matt",
      brandId: brand.id,
      categoryId: tiles.id,
      hsn: "6907",
      gstRate: 18,
      uomType: "PIECE_BOX_AREA",
      pcsPerBox: 8,
      sqftPerBox: 15.5,
      weightPerBoxKg: 26.5,
      mrpPaise: 115000n,
      reorderLevelPcs: 400,
    },
  });
  const wc = await prisma.product.create({
    data: { sku: "SN-HW-WC", name: "One-piece WC", brandId: brand.id, categoryId: sanitary.id, hsn: "6910", gstRate: 18, uomType: "UNIT", mrpPaise: 1850000n },
  });
  const supplier = await prisma.party.create({ data: { type: "SUPPLIER", name: "Kajaria Ceramics Ltd", stateCode: "33", gstin: "33AAACK1234A1Z5" } });
  const outsider = await prisma.party.create({ data: { type: "SUPPLIER", name: "Somany Ceramics (Gujarat)", stateCode: "24" } });
  return { brand, tile, wc, supplier, outsider };
}
