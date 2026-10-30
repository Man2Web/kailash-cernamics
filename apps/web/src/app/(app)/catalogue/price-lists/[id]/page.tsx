"use client";

import { use, useState } from "react";
import { toast } from "sonner";
import { formatDate, formatINR, labelOf, PRICE_BASES, toPerPieceRate } from "@gc/shared";
import { PageHeader, Section } from "@/components/common/page-header";
import { DataTable } from "@/components/common/data-table";
import { EntitySelect } from "@/components/common/entity-select";
import { MoneyInput, NativeSelect, FieldShell } from "@/components/common/form-fields";
import { ErrorState, LoadingPage } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { api, useApi, useApiMutation } from "@/lib/api";
import { useSession } from "@/lib/session";

interface Item {
  id: string;
  priceBasis: string;
  pricePaise: number;
  validFrom: string;
  product: { id: string; sku: string; name: string; uomType: string; pcsPerBox: number | null; sqftPerBox: number | null; mrpPaise: number; brand: { name: string } };
}

interface PickedProduct {
  id: string;
  sku: string;
  name: string;
  uomType: string;
  pcsPerBox: number | null;
  sqftPerBox: number | null;
}

export default function PriceListItemsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = useSession();
  const pl = useApi<{ id: string; name: string; segment: string }>(`/price-lists/${id}`);
  const [product, setProduct] = useState<PickedProduct | null>(null);
  const [basis, setBasis] = useState<string>("PER_SQFT");
  const [price, setPrice] = useState<number>(0);
  const save = useApiMutation(
    () => api(`/price-lists/${id}/items`, { method: "POST", body: { items: [{ productId: product!.id, priceBasis: basis, pricePaise: price }] } }),
    [`/price-lists/${id}`],
  );
  const del = useApiMutation((itemId: string) => api(`/price-list-items/${itemId}`, { method: "DELETE" }), [`/price-lists/${id}`]);

  if (pl.isLoading) return <LoadingPage />;
  if (pl.isError || !pl.data) return <ErrorState error={pl.error} />;

  const perPiece = product ? toPerPieceRate(price, basis, product) : 0;

  return (
    <>
      <PageHeader title={pl.data.name} description={`${labelOf(pl.data.segment)} customers`} back={{ href: "/catalogue/price-lists", label: "Price lists" }} />
      {can("price.write") && (
        <Section title="Set a price" className="mb-4">
          <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end">
            <FieldShell label="Product">
              <EntitySelect<PickedProduct>
                endpoint="/products"
                value={product?.id}
                onChange={(_, item) => {
                  setProduct(item);
                  if (item) setBasis(item.uomType === "PIECE_BOX_AREA" ? "PER_SQFT" : "PER_UNIT");
                }}
                getLabel={(p) => `${p.sku} · ${p.name}`}
              />
            </FieldShell>
            <FieldShell label="Price basis">
              <NativeSelect value={basis} onChange={(e) => setBasis(e.target.value)}>
                {PRICE_BASES.filter((b) => (product?.uomType === "UNIT" ? b === "PER_UNIT" : true)).map((b) => (
                  <option key={b} value={b}>
                    {labelOf(b)}
                  </option>
                ))}
              </NativeSelect>
            </FieldShell>
            <FieldShell label="Price (excl. GST)" hint={product && product.uomType === "PIECE_BOX_AREA" && price ? `${formatINR(perPiece)} per piece` : undefined}>
              <MoneyInput value={price} onChange={setPrice} />
            </FieldShell>
            <Button
              disabled={!product || !price || save.isPending}
              onClick={() =>
                save.mutate(undefined, {
                  onSuccess: () => {
                    toast.success("Price saved");
                    setProduct(null);
                    setPrice(0);
                  },
                  onError: (e) => toast.error(e.message),
                })
              }
            >
              Save price
            </Button>
          </div>
        </Section>
      )}
      <DataTable<Item>
        endpoint={`/price-lists/${id}/items`}
        exportName={`price-list-${pl.data.name}`}
        searchPlaceholder="Search SKU, name, brand…"
        rowActions={can("price.write") ? [{ label: "Remove", destructive: true, onSelect: (r) => del.mutate(r.id, { onSuccess: () => toast.success("Removed") }) }] : undefined}
        columns={[
          { id: "sku", header: "SKU", cell: ({ row }) => <span className="font-mono text-[12.5px]">{row.original.product.sku}</span>, meta: { exportValue: (r) => r.product.sku } },
          { id: "name", header: "Product", cell: ({ row }) => row.original.product.name, meta: { exportValue: (r) => r.product.name } },
          { id: "brand", header: "Brand", cell: ({ row }) => row.original.product.brand.name, meta: { exportValue: (r) => r.product.brand.name } },
          { accessorKey: "priceBasis", header: "Basis", cell: ({ row }) => labelOf(row.original.priceBasis) },
          { accessorKey: "pricePaise", header: "Price", meta: { align: "right", exportValue: (r) => r.pricePaise / 100 }, cell: ({ row }) => formatINR(row.original.pricePaise) },
          {
            id: "perPiece",
            header: "Per piece",
            meta: { align: "right", exportValue: (r) => toPerPieceRate(r.pricePaise, r.priceBasis, r.product) / 100 },
            cell: ({ row }) => formatINR(toPerPieceRate(row.original.pricePaise, row.original.priceBasis, row.original.product)),
          },
          { accessorKey: "validFrom", header: "Valid from", cell: ({ row }) => formatDate(row.original.validFrom), meta: { exportValue: (r) => formatDate(r.validFrom) } },
        ]}
      />
    </>
  );
}
