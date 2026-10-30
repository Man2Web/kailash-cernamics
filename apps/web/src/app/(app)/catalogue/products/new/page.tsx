"use client";

import { PageHeader } from "@/components/common/page-header";
import { ProductForm } from "@/components/masters/product-form";

export default function NewProductPage() {
  return (
    <>
      <PageHeader title="New product" back={{ href: "/catalogue/products", label: "Products" }} />
      <ProductForm />
    </>
  );
}
