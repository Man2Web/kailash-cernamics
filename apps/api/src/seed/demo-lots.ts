import type { PrismaClient } from "@prisma/client";
import type { seedBase } from "./base";

/** Demo data for shade & lot control and the reorder planner. Idempotent (only fills empty fields). */
export async function seedDemoLots(prisma: PrismaClient, _base: Awaited<ReturnType<typeof seedBase>>) {
  // tile applications by category / name
  const tiles = await prisma.product.findMany({
    where: { uomType: "PIECE_BOX_AREA", deletedAt: null },
    select: { id: true, name: true, applications: true, category: { select: { name: true } }, size: { select: { name: true } } },
  });
  let tagged = 0;
  for (const t of tiles) {
    if (t.applications.length) continue;
    const text = `${t.category.name} ${t.name}`.toLowerCase();
    const apps = new Set<string>();
    if (/parking|outdoor|paver|anti.?skid|heavy/.test(text)) ["PARKING", "OUTDOOR"].forEach((a) => apps.add(a));
    if (/elevation|facade|stone/.test(text)) apps.add("ELEVATION");
    if (/wall|bath|kitchen|mosaic|decor|highlighter/.test(text)) {
      apps.add("WALL");
      if (/bath|mosaic|anti.?skid/.test(text)) apps.add("BATHROOM");
      if (/kitchen|decor|highlighter/.test(text)) apps.add("KITCHEN");
    }
    if (/floor|gvt|pgvt|vitrified|slab|wood|marble|step/.test(text) || !apps.size) apps.add("FLOOR");
    if (/step|riser/.test(text)) apps.add("STEP");
    if (/bathroom floor|anti.?skid/.test(text)) apps.add("BATHROOM");
    await prisma.product.update({ where: { id: t.id }, data: { applications: [...apps], safetyStockDays: /slab|800x1600/.test(text + (t.size?.name ?? "")) ? 10 : 7 } });
    tagged++;
  }

  // brand lead times and preferred suppliers (supplier names usually carry the brand)
  const LEAD: Record<string, number> = { Kajaria: 12, Somany: 15, Johnson: 15, Orientbell: 10, Nitco: 20, Hindware: 10, Jaquar: 7, Cera: 10, Roff: 5 };
  const brands = await prisma.brand.findMany({ where: { deletedAt: null } });
  const suppliers = await prisma.party.findMany({ where: { type: { in: ["SUPPLIER", "BOTH"] }, deletedAt: null }, select: { id: true, name: true, notes: true } });
  let linked = 0;
  for (const b of brands) {
    const data: { leadTimeDays?: number; supplierId?: string } = {};
    if (LEAD[b.name] && b.leadTimeDays === 15 && LEAD[b.name] !== 15) data.leadTimeDays = LEAD[b.name];
    if (!b.supplierId) {
      const key = b.name.toLowerCase();
      const word = new RegExp(`\\b${key.replace(/[^a-z0-9]/g, "")}\\b`, "i");
      const s =
        suppliers.find((x) => word.test(x.name) || word.test(x.notes ?? "")) ??
        (["hindware", "jaquar", "cera"].includes(key) ? suppliers.find((x) => /sanitar|bath/i.test(x.name)) : undefined);
      if (s) {
        data.supplierId = s.id;
        linked++;
      }
    }
    if (Object.keys(data).length) await prisma.brand.update({ where: { id: b.id }, data });
  }
  if (tagged || linked) console.log(`demo-lots: ${tagged} tiles tagged with applications, ${linked} brands linked to suppliers`);
}
