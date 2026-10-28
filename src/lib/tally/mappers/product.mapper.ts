import { buildStockItemXml, wrapTallyEnvelope } from "../xml-builder";

export interface ProductSyncData {
  id: string;
  name: string;
  sku: string;
  code: string;
  hsnCode?: string | null;
  description?: string | null;
  purchasePrice?: number | null;
  sellingPrice?: number | null;
  gstRate?: number | null;
  unitName?: string | null;
  openingStock?: number | null;
}

export function mapProductToTallyStockItem(product: ProductSyncData, companyName?: string) {
  const stockItemXml = buildStockItemXml({
    name: product.name,
    unit: product.unitName || "Nos",
    hsnCode: product.hsnCode,
    gstRate: product.gstRate !== undefined && product.gstRate !== null ? Number(product.gstRate) : 18,
    sellingPrice: product.sellingPrice ? Number(product.sellingPrice) : null,
    purchasePrice: product.purchasePrice ? Number(product.purchasePrice) : null,
    description: product.description,
    openingQty: product.openingStock ? Number(product.openingStock) : 0,
    openingRate: product.purchasePrice ? Number(product.purchasePrice) : 0,
    guid: product.id,
  });

  const fullXml = wrapTallyEnvelope(stockItemXml, companyName);

  return {
    stockItemName: product.name,
    guid: product.id,
    stockItemXml,
    fullXml,
  };
}
