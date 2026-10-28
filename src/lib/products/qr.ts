import db from "@/lib/db/db";
import QRCode from "qrcode";
import { randomBytes } from "crypto";
import { getActiveReservations } from "@/lib/inventory/movement";
import { classifyScan } from "@/lib/products/qr-parse";

export interface WarehouseStockItem {
  warehouseId: string;
  warehouseName: string;
  onHand: number;
  reserved: number;
  available: number;
  inTransit?: number;
  damaged?: number;
}

export interface ProductQrResult {
  product: {
    id: string;
    code: string;
    name: string;
    sku: string;
    category: string;
    brand: string;
    unit: string;
    sellingPrice: number;
    purchasePrice: number;
    mrp: number;
    qrCode: string;
    qrDataUrl?: string;
  };
  warehouses: WarehouseStockItem[];
  totalOnHand: number;
  totalReserved: number;
  totalAvailable: number;
  lastUpdated: string;
}

/**
 * Generate a cryptographically unique permanent QR code for a product.
 * Format: PROD-QR-[HEX_TOKEN]
 */
export function generateUniqueQrToken(): string {
  const token = randomBytes(6).toString("hex").toUpperCase();
  return `PROD-QR-${token}`;
}

/**
 * Generate a Base64 PNG Data URL for a given QR string.
 */
export async function generateQrDataUrl(qrString: string): Promise<string> {
  try {
    return await QRCode.toDataURL(qrString, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 280,
      color: {
        dark: "#0f172a",
        light: "#ffffff",
      },
    });
  } catch (err) {
    console.error("Error generating QR data URL:", err);
    return "";
  }
}

/**
 * Resolve or retrieve the permanent QR code for a product.
 * Checks existing barcode/QR entries and generates/stores if missing.
 */
export async function getOrGenerateProductQr(productId: string, productCode: string, sku: string): Promise<string> {
  try {
    // 1. Check if product already has a QR code registered in product_barcodes
    const existingQr = await db.productBarcode.findFirst({
      where: {
        productId,
        code: {
          startsWith: "PROD-QR-",
        },
      },
    });

    if (existingQr && existingQr.code) {
      return existingQr.code;
    }

    // 2. Generate a new unique QR code
    let newQr = generateUniqueQrToken();
    let attempts = 0;
    while (attempts < 5) {
      const collisionCheck = await db.productBarcode.findFirst({
        where: { code: newQr },
      });
      if (!collisionCheck) break;
      newQr = generateUniqueQrToken();
      attempts++;
    }

    // 3. Store in product_barcodes
    try {
      await db.productBarcode.create({
        data: {
          productId,
          code: newQr,
        },
      });
    } catch (e) {
      console.warn("Could not insert product barcode:", e);
    }

    // 4. Store in activity_logs
    try {
      await db.activityLog.create({
        data: {
          userId: "SYSTEM",
          module: "PRODUCT_QR",
          description: JSON.stringify({
            productId,
            productCode,
            sku,
            qrCode: newQr,
            createdAt: new Date().toISOString(),
          }),
        },
      });
    } catch {}

    return newQr;
  } catch (err) {
    console.error("Error in getOrGenerateProductQr:", err);
    return `PROD-QR-${productCode}`;
  }
}

/**
 * Query current live warehouse inventory for a product across all warehouses.
 * Formula: Available = On Hand - Reserved
 */
export async function getLiveProductInventory(productId: string): Promise<ProductQrResult | null> {
  // 1. Fetch product master
  const product = await db.product.findUnique({
    where: { id: productId },
    include: {
      category: true,
      brand: true,
      unit: true,
      variants: true,
      stocks: true,
    },
  });

  if (!product) return null;

  // 2. Fetch all warehouses
  const warehouses = await db.warehouse.findMany({
    orderBy: { name: "asc" },
  });

  // 3. Fetch active reservations across all warehouses
  const activeReservations = await getActiveReservations();

  // 4. Calculate warehouse-wise stock
  const warehouseStockMap = new Map<string, { onHand: number; reserved: number; available: number }>();

  // Initialize all warehouses with 0
  for (const wh of warehouses) {
    warehouseStockMap.set(wh.id, {
      onHand: 0,
      reserved: 0,
      available: 0,
    });
  }

  // Aggregate on-hand stock from product.stocks
  const stocks = product.stocks || [];
  for (const s of stocks) {
    const whId = s.warehouseId;
    if (whId && warehouseStockMap.has(whId)) {
      const current = warehouseStockMap.get(whId)!;
      current.onHand += Number(s.quantity || 0);
    }
  }

  // Aggregate active reservations for all variants of this product
  const variants = product.variants || [];
  for (const wh of warehouses) {
    const current = warehouseStockMap.get(wh.id)!;
    let whReserved = 0;

    for (const v of variants) {
      const key = `${v.id}_${wh.id}`;
      whReserved += activeReservations[key] || 0;
    }

    current.reserved = whReserved;
    current.available = Math.max(0, current.onHand - current.reserved);
  }

  const warehouseList: WarehouseStockItem[] = warehouses.map((wh: any) => {
    const stockData = warehouseStockMap.get(wh.id) || { onHand: 0, reserved: 0, available: 0 };
    return {
      warehouseId: wh.id,
      warehouseName: wh.name,
      onHand: stockData.onHand,
      reserved: stockData.reserved,
      available: stockData.available,
    };
  });

  const totalOnHand = warehouseList.reduce((sum, w) => sum + w.onHand, 0);
  const totalReserved = warehouseList.reduce((sum, w) => sum + w.reserved, 0);
  const totalAvailable = warehouseList.reduce((sum, w) => sum + w.available, 0);

  // 5. Get permanent QR code and Data URL
  const qrCode = await getOrGenerateProductQr(product.id, product.code, product.sku);
  const qrDataUrl = await generateQrDataUrl(qrCode);

  const now = new Date();
  const lastUpdated = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(now);

  return {
    product: {
      id: product.id,
      code: product.code,
      name: product.name,
      sku: product.sku,
      category: product.category?.name || "General",
      brand: product.brand?.name || "—",
      unit: product.unit?.code || "NOS",
      sellingPrice: Number(product.sellingPrice || 0),
      purchasePrice: Number(product.purchasePrice || 0),
      mrp: Number(product.mrp || 0),
      qrCode,
      qrDataUrl,
    },
    warehouses: warehouseList,
    totalOnHand,
    totalReserved,
    totalAvailable,
    lastUpdated,
  };
}

/**
 * Resolve any scanned QR code string to the matching product and return current stock.
 * Handles:
 * - Direct QR identifier: PROD-QR-XXXXXX
 * - Product Code: PRDXXXX
 * - Product SKU: SKU-XXXX
 * - Product ID: UUID
 */
export async function resolveProductByQr(
  scannedValue: string,
  mode: "camera" | "manual" = "manual"
): Promise<ProductQrResult | null> {
  if (!scannedValue || typeof scannedValue !== "string" || scannedValue.trim().length === 0) return null;
  const { kind, value } = classifyScan(scannedValue);

  // 1. Registered product QR token (exact match)
  if (kind === "product-token") {
    const rec = await db.productBarcode.findFirst({ where: { code: value } });
    if (rec?.productId) return getLiveProductInventory(rec.productId);
  }

  // Camera scans must be a real product QR; typed lookups may also use code / SKU / id.
  if (mode === "camera") return null;

  const query = value;
  const byCode = await db.product.findFirst({ where: { code: { equals: query, mode: "insensitive" } } });
  if (byCode) return getLiveProductInventory(byCode.id);
  const bySku = await db.product.findFirst({ where: { sku: { equals: query, mode: "insensitive" } } });
  if (bySku) return getLiveProductInventory(bySku.id);
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query)) {
    const byId = await db.product.findFirst({ where: { id: query.toLowerCase() } });
    if (byId) return getLiveProductInventory(byId.id);
  }
  return null;
}

/**
 * Backfill QR codes for all existing products that do not have one yet.
 */
export async function backfillAllProductQrCodes(): Promise<{ total: number; generated: number }> {
  const products = await db.product.findMany();
  let generated = 0;

  for (const p of products) {
    const existing = await db.productBarcode.findFirst({
      where: { productId: p.id },
    });

    if (!existing || !existing.code?.startsWith("PROD-QR-")) {
      await getOrGenerateProductQr(p.id, p.code, p.sku);
      generated++;
    }
  }

  return { total: products.length, generated };
}
