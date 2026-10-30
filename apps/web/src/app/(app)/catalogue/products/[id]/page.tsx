"use client";

import { use } from "react";
import { PageHeader } from "@/components/common/page-header";
import { ErrorState, LoadingPage } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { ProductForm, VariantsSection, type ProductRow } from "@/components/masters/product-form";
import { useApi } from "@/lib/api";

export default function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const q = useApi<ProductRow>(`/products/${id}`);
  if (q.isLoading) return <LoadingPage />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const p = q.data;
  return (
    <>
      <PageHeader
        title={p.name}
        description={
          <span className="flex items-center gap-2">
            <span className="font-mono">{p.sku}</span> · {p.brand?.name} · {p.category?.name}
            {!p.isActive && <StatusBadge status="CANCELLED" label="Inactive" />}
          </span>
        }
        back={{ href: "/catalogue/products", label: "Products" }}
      />
      <div className="space-y-4">
        <ProductForm key={String((p as unknown as { updatedAt?: string }).updatedAt ?? p.id)} product={p} />
        {p.uomType === "UNIT" && <VariantsSection productId={p.id} />}
      </div>
    </>
  );
}
