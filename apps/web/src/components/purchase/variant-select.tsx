"use client";

import { NativeSelect } from "@/components/common/form-fields";
import { useApi } from "@/lib/api";

interface ProductWithVariants {
  id: string;
  variants?: { id: string; skuSuffix: string; name: string | null; color?: { name: string; hex: string | null } | null }[];
}

/**
 * Colour / variant picker for sanitary and CP items on a GRN line. Each colour is stocked as its
 * own lot; items without variants fall back to a single default lot.
 */
export function VariantSelect({ productId, value, onChange }: { productId: string | null | undefined; value: string | null | undefined; onChange: (id: string | null) => void }) {
  const q = useApi<ProductWithVariants>(productId ? `/products/${productId}` : null);
  const variants = q.data?.variants ?? [];
  if (!productId) return <span className="text-[12px] text-muted-foreground">—</span>;
  if (q.isLoading) return <span className="text-[12px] text-muted-foreground">Loading…</span>;
  if (!variants.length) return <span className="text-[12px] text-muted-foreground">No colour variants (single lot)</span>;
  return (
    <NativeSelect aria-label="Colour / variant" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Select colour…</option>
      {variants.map((v) => (
        <option key={v.id} value={v.id}>
          {v.color?.name ?? v.name ?? v.skuSuffix} · {v.skuSuffix}
        </option>
      ))}
    </NativeSelect>
  );
}
