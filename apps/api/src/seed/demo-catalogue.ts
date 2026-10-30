import type { PrismaClient, Segment } from "@prisma/client";
import { gstinChecksum, SQFT_PER_SQM } from "@gc/shared";
import type { seedBase } from "./base";

type Base = Awaited<ReturnType<typeof seedBase>>;

/** A checksum-valid demo GSTIN for a state + PAN-like body. */
function gstin(state: string, pan: string, entity = "1") {
  const first14 = `${state}${pan}${entity}Z`;
  return first14 + gstinChecksum(first14);
}

const BRANDS = ["Kajaria", "Somany", "Johnson", "Orientbell", "Nitco", "Hindware", "Jaquar", "Cera", "Roff"];
const CATEGORIES: { name: string; type: "TILE" | "SANITARY" | "CP_FITTING" | "ACCESSORY" | "ADHESIVE" }[] = [
  { name: "Floor tiles", type: "TILE" },
  { name: "Wall tiles", type: "TILE" },
  { name: "Sanitaryware", type: "SANITARY" },
  { name: "CP fittings", type: "CP_FITTING" },
  { name: "Accessories", type: "ACCESSORY" },
  { name: "Adhesives & grout", type: "ADHESIVE" },
];
const SIZES = [
  { name: "600x600", lengthMm: 600, widthMm: 600, thicknessMm: 9, pcs: 4, sqft: 15.5, kg: 26 },
  { name: "600x1200", lengthMm: 600, widthMm: 1200, thicknessMm: 9, pcs: 2, sqft: 15.5, kg: 30 },
  { name: "800x1600", lengthMm: 800, widthMm: 1600, thicknessMm: 9, pcs: 2, sqft: 27.56, kg: 52 },
  { name: "300x600", lengthMm: 300, widthMm: 600, thicknessMm: 8, pcs: 8, sqft: 15.5, kg: 24 },
  { name: "300x450", lengthMm: 300, widthMm: 450, thicknessMm: 7, pcs: 10, sqft: 14.53, kg: 17 },
  { name: "400x400", lengthMm: 400, widthMm: 400, thicknessMm: 9, pcs: 6, sqft: 10.33, kg: 18 },
];
const FINISHES = ["Glossy", "Matt", "Satin", "Rustic", "Chrome", "Carving"];
const COLORS = [
  { name: "White", hex: "#f5f5f2" },
  { name: "Ivory", hex: "#efe6cf" },
  { name: "Beige", hex: "#d8c3a0" },
  { name: "Grey", hex: "#9a9a9a" },
  { name: "Brown", hex: "#7a5236" },
  { name: "Black", hex: "#1f1f1f" },
  { name: "Blue", hex: "#3e6e9c" },
  { name: "Chrome", hex: "#c9cdd2" },
];

// [sku, name, brand, category, series, size, finish, color, retail ₹/sqft, allowLoose]
const TILES: [string, string, string, string, string, string, string, string, number, boolean][] = [
  ["TL-KJ-6012-CAL", "Calacatta Gold Glossy", "Kajaria", "Floor tiles", "Eternity", "600x1200", "Glossy", "White", 92, false],
  ["TL-KJ-6012-STA", "Statuario Royale PGVT", "Kajaria", "Floor tiles", "Eternity", "600x1200", "Glossy", "White", 98, false],
  ["TL-KJ-8016-ARM", "Armani Grey Slab", "Kajaria", "Floor tiles", "Eternity", "800x1600", "Satin", "Grey", 145, false],
  ["TL-KJ-6060-SAN", "Sandune Beige Matt", "Kajaria", "Floor tiles", "Vitronite", "600x600", "Matt", "Beige", 58, false],
  ["TL-KJ-6060-CRE", "Crema Marfil GVT", "Kajaria", "Floor tiles", "Vitronite", "600x600", "Glossy", "Ivory", 62, false],
  ["TL-KJ-3060-AQU", "Aqua Mosaic Wall", "Kajaria", "Wall tiles", "Aquarius", "300x600", "Glossy", "Blue", 48, true],
  ["TL-KJ-3045-HLT", "Kitchen Highlighter Floral", "Kajaria", "Wall tiles", "Aquarius", "300x450", "Glossy", "White", 52, true],
  ["TL-SM-3060-WD", "Wood Strip Matt", "Somany", "Floor tiles", "Woodland", "300x600", "Matt", "Brown", 55, true],
  ["TL-SM-6012-OAK", "Oak Plank Rustic", "Somany", "Floor tiles", "Woodland", "600x1200", "Rustic", "Brown", 88, false],
  ["TL-SM-6060-DUR", "Duragres Grey Heavy Duty", "Somany", "Floor tiles", "Duragres", "600x600", "Matt", "Grey", 66, false],
  ["TL-SM-6060-MRB", "Marble Bianco Glossy", "Somany", "Floor tiles", "Vitro", "600x600", "Glossy", "White", 64, false],
  ["TL-SM-3045-BTH", "Bath Ivory Plain", "Somany", "Wall tiles", "Glazzio", "300x450", "Glossy", "Ivory", 38, true],
  ["TL-SM-3045-BTD", "Bath Ivory Decor", "Somany", "Wall tiles", "Glazzio", "300x450", "Glossy", "Ivory", 46, true],
  ["TL-JN-6060-END", "Endura Parking Grey", "Johnson", "Floor tiles", "Endura", "400x400", "Rustic", "Grey", 42, false],
  ["TL-JN-4040-PRK", "Parking Cobble Red", "Johnson", "Floor tiles", "Endura", "400x400", "Carving", "Brown", 39, false],
  ["TL-JN-6012-MAR", "Marbonite Silver", "Johnson", "Floor tiles", "Marbonite", "600x1200", "Satin", "Grey", 84, false],
  ["TL-JN-3060-KIT", "Kitchen Subway White", "Johnson", "Wall tiles", "Pristine", "300x600", "Glossy", "White", 44, true],
  ["TL-JN-3045-ELV", "Elevation Stone Grey", "Johnson", "Wall tiles", "Pristine", "300x450", "Rustic", "Grey", 49, true],
  ["TL-OB-6060-ARZ", "Arizona Beige DGVT", "Orientbell", "Floor tiles", "Inspire", "600x600", "Glossy", "Beige", 59, false],
  ["TL-OB-6012-CAR", "Carrara White PGVT", "Orientbell", "Floor tiles", "Inspire", "600x1200", "Glossy", "White", 86, false],
  ["TL-OB-8016-NER", "Nero Marquina Slab", "Orientbell", "Floor tiles", "Grande", "800x1600", "Glossy", "Black", 152, false],
  ["TL-OB-3060-TER", "Terrazzo Wall Matt", "Orientbell", "Wall tiles", "Inspire", "300x600", "Matt", "Grey", 47, true],
  ["TL-OB-4040-ANT", "Anti-skid Bathroom Floor", "Orientbell", "Floor tiles", "Safe", "400x400", "Matt", "Beige", 41, false],
  ["TL-NT-6012-ONX", "Onyx Gold Glossy", "Nitco", "Floor tiles", "Le Marbre", "600x1200", "Glossy", "Beige", 112, false],
  ["TL-NT-8016-PAN", "Panda White Slab", "Nitco", "Floor tiles", "Le Marbre", "800x1600", "Glossy", "White", 168, false],
  ["TL-NT-6060-CEM", "Cemento Grey Matt", "Nitco", "Floor tiles", "Urban", "600x600", "Matt", "Grey", 61, false],
  ["TL-NT-3060-HEX", "Hexa Decor Highlighter", "Nitco", "Wall tiles", "Urban", "300x600", "Satin", "Blue", 58, true],
  ["TL-KJ-6060-TER", "Terracotta Outdoor", "Kajaria", "Floor tiles", "Outdoor", "600x600", "Rustic", "Brown", 57, false],
  ["TL-SM-6012-GLD", "Golden Spider PGVT", "Somany", "Floor tiles", "Vitro", "600x1200", "Glossy", "Beige", 95, false],
  ["TL-JN-6060-SLT", "Slate Black Rustic", "Johnson", "Floor tiles", "Endura", "600x600", "Rustic", "Black", 63, false],
  ["TL-OB-3045-KTN", "Kitchen Moroccan Decor", "Orientbell", "Wall tiles", "Safe", "300x450", "Glossy", "Blue", 51, true],
  ["TL-KJ-4040-STP", "Step & Riser Beige", "Kajaria", "Floor tiles", "Outdoor", "400x400", "Matt", "Beige", 45, false],
  ["TL-NT-6060-WOD", "Wooden Deck Matt", "Nitco", "Floor tiles", "Urban", "600x600", "Matt", "Brown", 60, false],
  ["TL-SM-8016-BRG", "Bottochino Slab", "Somany", "Floor tiles", "Vitro", "800x1600", "Satin", "Ivory", 139, false],
  ["TL-OB-6060-BLU", "Pool Blue Mosaic Look", "Orientbell", "Wall tiles", "Grande", "600x600", "Glossy", "Blue", 67, false],
];

// [sku, name, brand, category, unit, mrp ₹, hsn, retail ₹]
const UNITS: [string, string, string, string, string, number, string, number][] = [
  ["SN-HW-WC-ONE", "One-piece WC Rimless", "Hindware", "Sanitaryware", "nos", 18500, "6910", 15400],
  ["SN-HW-WC-WALL", "Wall-hung WC with Seat Cover", "Hindware", "Sanitaryware", "nos", 14200, "6910", 11900],
  ["SN-CR-BASIN-TT", "Table-top Basin Oval", "Cera", "Sanitaryware", "nos", 6800, "6910", 5600],
  ["SN-CR-BASIN-PED", "Pedestal Basin Set", "Cera", "Sanitaryware", "set", 5200, "6910", 4300],
  ["SN-HW-URINAL", "Urinal with Sensor", "Hindware", "Sanitaryware", "nos", 9800, "6910", 8200],
  ["CP-JQ-BASIN-MX", "Basin Mixer Single Lever", "Jaquar", "CP fittings", "nos", 6200, "8481", 5100],
  ["CP-JQ-SHOWER-RD", "Overhead Shower 8 inch Round", "Jaquar", "CP fittings", "nos", 4800, "8481", 3950],
  ["CP-JQ-DIVERTER", "Wall Mixer with Diverter", "Jaquar", "CP fittings", "nos", 9400, "8481", 7800],
  ["CP-CR-HEALTH", "Health Faucet with Hose", "Cera", "CP fittings", "set", 1450, "8481", 1150],
  ["AC-JQ-TOWEL-RG", "Towel Ring Chrome", "Jaquar", "Accessories", "nos", 1650, "8302", 1350],
  ["AD-RF-NS-20", "Roff NS Adhesive 20 kg", "Roff", "Adhesives & grout", "bag", 720, "3214", 640],
  ["AD-RF-GROUT-1", "Roff Epoxy Grout 1 kg", "Roff", "Adhesives & grout", "nos", 980, "3214", 860],
];

const SEGMENT_FACTOR: Record<Segment, number> = { RETAIL: 1, CONTRACTOR: 0.92, BUILDER: 0.88, DEALER: 0.85, INSTITUTION: 0.9, CLEARANCE: 0.6 };

const CUSTOMERS: { name: string; segment: Segment; phone: string; city: string; stateCode?: string; pan?: string; creditDays?: number; creditLimit?: number; sites?: string[] }[] = [
  { name: "Sri Murugan Constructions", segment: "BUILDER", phone: "9842012345", city: "Coimbatore", pan: "AAKFS1234M", creditDays: 30, creditLimit: 1500000, sites: ["Saravanampatti Villas", "RS Puram Apartments"] },
  { name: "Lakshmi Builders & Developers", segment: "BUILDER", phone: "9843056789", city: "Coimbatore", pan: "AABCL5678K", creditDays: 45, creditLimit: 2500000, sites: ["Vadavalli Gated Community"] },
  { name: "Annai Interiors", segment: "CONTRACTOR", phone: "9894011223", city: "Coimbatore", pan: "BCDPA4321Q", creditDays: 15, creditLimit: 300000, sites: ["Peelamedu Office Fit-out"] },
  { name: "Kovai Tile Contractors", segment: "CONTRACTOR", phone: "9787022334", city: "Coimbatore", creditDays: 15, creditLimit: 200000, sites: ["Singanallur House"] },
  { name: "Selvam Tiles & Sanitary", segment: "DEALER", phone: "9842233445", city: "Tiruppur", pan: "ACXPS7788L", creditDays: 30, creditLimit: 800000 },
  { name: "Erode Ceramic Centre", segment: "DEALER", phone: "9443344556", city: "Erode", pan: "AADFE2233P", creditDays: 30, creditLimit: 600000 },
  { name: "PSG Institutions", segment: "INSTITUTION", phone: "4222572177", city: "Coimbatore", pan: "AAATP1122C", creditDays: 60, creditLimit: 1000000 },
  { name: "Palakkad Home Decor", segment: "DEALER", phone: "9447011223", city: "Palakkad", stateCode: "32", pan: "AAGFP9988H", creditDays: 30, creditLimit: 500000 },
  { name: "R. Senthil Kumar", segment: "RETAIL", phone: "9865012121", city: "Coimbatore" },
  { name: "Meena Ramesh", segment: "RETAIL", phone: "9787034343", city: "Pollachi" },
  { name: "Arun Prakash", segment: "RETAIL", phone: "9952045454", city: "Coimbatore" },
  { name: "Divya Venkatesh", segment: "RETAIL", phone: "9003056565", city: "Mettupalayam" },
  { name: "Karthik Plumbing Works", segment: "CONTRACTOR", phone: "9994067676", city: "Coimbatore", creditDays: 7, creditLimit: 100000 },
  { name: "Green Valley Resorts", segment: "BUILDER", phone: "9842078787", city: "Ooty", pan: "AAECG3344R", creditDays: 30, creditLimit: 1200000, sites: ["Ooty Cottages Phase 2"] },
  { name: "Walk-in Customer", segment: "RETAIL", phone: "", city: "Coimbatore" },
];

const SUPPLIERS = [
  { name: "Kajaria Ceramics Ltd (Chennai Depot)", pan: "AAACK1234D", stateCode: "33", phone: "4442150000" },
  { name: "Somany Ceramics Distributor - Kovai Agencies", pan: "AAFFK5566J", stateCode: "33", phone: "4222345678" },
  { name: "H & R Johnson (India) - Bengaluru", pan: "AAACH7788B", stateCode: "29", phone: "8041234567" },
  { name: "Orientbell Ltd - South Depot", pan: "AAACO4455E", stateCode: "33", phone: "4443210000" },
  { name: "Jaquar & Company - Coimbatore", pan: "AAACJ6677F", stateCode: "33", phone: "4224567890" },
];

const INFLUENCERS: { type: "ARCHITECT" | "INTERIOR" | "PLUMBER" | "MASON"; name: string; phone: string; firm?: string; pct: number }[] = [
  { type: "ARCHITECT", name: "Ar. Priya Natarajan", phone: "9842111222", firm: "Studio Kovai", pct: 2 },
  { type: "ARCHITECT", name: "Ar. Vignesh Raj", phone: "9894222333", firm: "VR Architects", pct: 2 },
  { type: "INTERIOR", name: "Shalini Designs", phone: "9787333444", firm: "Shalini Interiors", pct: 1.5 },
  { type: "PLUMBER", name: "Murugesan", phone: "9994444555", pct: 1 },
  { type: "MASON", name: "Raju Mestri", phone: "9952555666", pct: 1 },
  { type: "MASON", name: "Selvaraj", phone: "9003666777", pct: 1 },
];

/** Demo masters: brands, sizes, ~35 tiles, ~12 sanitary/CP/adhesive items, price lists, parties. */
export async function seedDemoCatalogue(prisma: PrismaClient, _base: Base) {
  const byName = async <T extends { id: string }>(model: any, name: string, create: Record<string, unknown>): Promise<T> =>
    (await model.findFirst({ where: { name } })) ?? (await model.create({ data: { name, ...create } }));

  const brands: Record<string, string> = {};
  for (const b of BRANDS) brands[b] = (await byName<{ id: string }>(prisma.brand, b, { code: b.slice(0, 3).toUpperCase() })).id;
  const cats: Record<string, string> = {};
  for (const c of CATEGORIES) cats[c.name] = (await byName<{ id: string }>(prisma.category, c.name, { type: c.type })).id;
  const sizes: Record<string, (typeof SIZES)[number] & { id: string }> = {};
  for (const s of SIZES) {
    const row = await byName<{ id: string }>(prisma.size, s.name, { lengthMm: s.lengthMm, widthMm: s.widthMm, thicknessMm: s.thicknessMm });
    sizes[s.name] = { ...s, id: row.id };
  }
  const finishes: Record<string, string> = {};
  for (const f of FINISHES) finishes[f] = (await byName<{ id: string }>(prisma.finish, f, {})).id;
  const colors: Record<string, string> = {};
  for (const c of COLORS) colors[c.name] = (await byName<{ id: string }>(prisma.color, c.name, { hex: c.hex })).id;
  const series: Record<string, string> = {};
  for (const t of TILES) {
    const key = `${t[2]}|${t[4]}`;
    if (series[key]) continue;
    const found = await prisma.series.findFirst({ where: { name: t[4], brandId: brands[t[2]] } });
    series[key] = (found ?? (await prisma.series.create({ data: { name: t[4], brandId: brands[t[2]] } }))).id;
  }

  // price lists per segment
  const lists: Partial<Record<Segment, string>> = {};
  for (const seg of Object.keys(SEGMENT_FACTOR) as Segment[]) {
    const name = `${seg[0]}${seg.slice(1).toLowerCase()} price list`;
    lists[seg] = (await byName<{ id: string }>(prisma.priceList, name, { segment: seg })).id;
  }
  const setPrice = async (productId: string, basis: "PER_SQFT" | "PER_UNIT", retailPaise: number) => {
    for (const [seg, f] of Object.entries(SEGMENT_FACTOR) as [Segment, number][]) {
      const priceListId = lists[seg]!;
      const exists = await prisma.priceListItem.findFirst({ where: { priceListId, productId, deletedAt: null } });
      if (exists) continue;
      await prisma.priceListItem.create({
        data: { priceListId, productId, priceBasis: basis, pricePaise: BigInt(Math.round((retailPaise * f) / 100) * 100), validFrom: new Date("2026-04-01T00:00:00Z") },
      });
    }
  };

  for (const [sku, name, brand, cat, ser, size, finish, color, perSqft, loose] of TILES) {
    const s = sizes[size];
    const mrpPerBox = Math.round(perSqft * 1.25 * s.sqft) * 100;
    const existing = await prisma.product.findUnique({ where: { sku } });
    const p =
      existing ??
      (await prisma.product.create({
        data: {
          sku,
          name,
          brandId: brands[brand],
          categoryId: cats[cat],
          seriesId: series[`${brand}|${ser}`],
          sizeId: s.id,
          finishId: finishes[finish],
          colorId: colors[color],
          hsn: "6907",
          gstRate: 18,
          uomType: "PIECE_BOX_AREA",
          unitName: "pcs",
          pcsPerBox: s.pcs,
          sqftPerBox: s.sqft,
          sqmPerBox: Math.round((s.sqft / SQFT_PER_SQM) * 10000) / 10000,
          weightPerBoxKg: s.kg,
          mrpPaise: BigInt(mrpPerBox),
          allowLooseSale: loose,
          reorderLevelPcs: s.pcs * 25,
          description: `${brand} ${ser} ${size} mm ${finish.toLowerCase()} tile`,
        },
      }));
    await setPrice(p.id, "PER_SQFT", perSqft * 100);
  }

  for (const [sku, name, brand, cat, unit, mrp, hsn, retail] of UNITS) {
    const existing = await prisma.product.findUnique({ where: { sku } });
    const p =
      existing ??
      (await prisma.product.create({
        data: {
          sku,
          name,
          brandId: brands[brand],
          categoryId: cats[cat],
          colorId: colors[sku.startsWith("CP") || sku.startsWith("AC") ? "Chrome" : "White"],
          hsn,
          gstRate: 18,
          uomType: "UNIT",
          unitName: unit,
          mrpPaise: BigInt(mrp * 100),
          allowLooseSale: true,
          reorderLevelPcs: sku.startsWith("AD") ? 20 : 3,
          description: `${brand} ${name}`,
        },
      }));
    await setPrice(p.id, "PER_UNIT", retail * 100);
    if (sku === "SN-HW-WC-ONE") {
      for (const [suffix, color] of [["IV", "Ivory"], ["BK", "Black"]] as const) {
        await prisma.productVariant.upsert({
          where: { productId_skuSuffix: { productId: p.id, skuSuffix: suffix } },
          create: { productId: p.id, skuSuffix: suffix, colorId: colors[color], name: `${color} colour`, mrpPaise: BigInt((mrp + 1500) * 100) },
          update: {},
        });
      }
    }
  }

  // parties
  for (const c of CUSTOMERS) {
    const stateCode = c.stateCode ?? "33";
    const exists = await prisma.party.findFirst({ where: { name: c.name } });
    if (exists) continue;
    const party = await prisma.party.create({
      data: {
        type: "CUSTOMER",
        segment: c.segment,
        name: c.name,
        phone: c.phone || null,
        city: c.city,
        stateCode,
        gstin: c.pan ? gstin(stateCode, c.pan) : null,
        billingAddress: `${c.city}, ${stateCode === "32" ? "Kerala" : "Tamil Nadu"}`,
        creditDays: c.creditDays ?? 0,
        creditLimitPaise: BigInt((c.creditLimit ?? 0) * 100),
      },
    });
    for (const s of c.sites ?? []) {
      await prisma.site.create({ data: { partyId: party.id, name: s, address: `${s}, ${c.city}`, contactName: "Site engineer", contactPhone: c.phone } });
    }
  }
  for (const s of SUPPLIERS) {
    const exists = await prisma.party.findFirst({ where: { name: s.name } });
    if (exists) continue;
    await prisma.party.create({
      data: { type: "SUPPLIER", segment: "DEALER", name: s.name, phone: s.phone, stateCode: s.stateCode, gstin: gstin(s.stateCode, s.pan), creditDays: 45, billingAddress: s.name.split(" - ").pop() ?? null },
    });
  }
  for (const i of INFLUENCERS) {
    const exists = await prisma.influencer.findFirst({ where: { name: i.name } });
    if (!exists) await prisma.influencer.create({ data: { type: i.type, name: i.name, phone: i.phone, firm: i.firm ?? null, commissionPct: i.pct } });
  }
  await prisma.vehicle.upsert({ where: { number: "TN37BX4521" }, create: { number: "TN37BX4521", type: "Tata 407", driverName: "Ganesan", driverPhone: "9842099887" }, update: {} });
  await prisma.vehicle.upsert({ where: { number: "TN38CA1188" }, create: { number: "TN38CA1188", type: "Ashok Leyland Dost", driverName: "Prakash", driverPhone: "9787012398" }, update: {} });
}
