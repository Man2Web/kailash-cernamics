/** Exact (case-insensitive) match of a delivery source against the warehouse id or name. Never fuzzy, never matches blanks. */
export function matchesWarehouse(source: string | null | undefined, warehouseId: string, warehouseName?: string | null): boolean {
  const s = (source || "").trim().toLowerCase();
  if (!s) return false;
  return s === warehouseId.toLowerCase() || (!!warehouseName && s === warehouseName.trim().toLowerCase());
}
