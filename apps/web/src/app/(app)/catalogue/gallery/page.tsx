"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ImageOff, Search } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useList } from "@/lib/api";

interface P {
  id: string;
  sku: string;
  name: string;
  images: string[];
  brand: { name: string };
  size: { name: string } | null;
}

export default function GalleryPage() {
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => {
      setDq(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  const list = useList<P>("/products", { q: dq, page, pageSize: 48, isActive: "true" });
  const total = list.data?.total ?? 0;
  return (
    <>
      <PageHeader title="Image gallery" description="Product photos for showing customers and sharing on WhatsApp." />
      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search SKU, name, brand, size…" className="pl-8" />
      </div>
      {list.isLoading ? (
        <LoadingRows />
      ) : list.isError ? (
        <ErrorState error={list.error} retry={() => list.refetch()} />
      ) : !total ? (
        <EmptyState title="No products found" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {list.data!.items.map((p) => (
              <Link key={p.id} href={`/catalogue/products/${p.id}`} className="group overflow-hidden rounded-xl bg-card shadow-card">
                <div className="aspect-square bg-fill">
                  {p.images[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.images[0]} alt={p.name} className="size-full object-cover transition group-hover:scale-105" />
                  ) : (
                    <span className="grid size-full place-items-center text-muted-foreground">
                      <ImageOff className="size-6" />
                    </span>
                  )}
                </div>
                <div className="p-2.5">
                  <div className="truncate text-[13px] font-medium">{p.name}</div>
                  <div className="truncate text-[11.5px] text-muted-foreground">
                    {p.brand.name} {p.size ? `· ${p.size.name}` : ""}
                  </div>
                </div>
              </Link>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-center gap-2 text-[13px]">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="tabular text-muted-foreground">
              Page {page} of {Math.max(1, Math.ceil(total / 48))}
            </span>
            <Button variant="secondary" size="sm" disabled={page * 48 >= total} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </>
      )}
    </>
  );
}
