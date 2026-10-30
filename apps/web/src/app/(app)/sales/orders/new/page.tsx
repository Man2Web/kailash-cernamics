"use client";

import { PageHeader } from "@/components/common/page-header";
import { DocForm, emptyDoc } from "@/components/sales/doc-form";

export default function NewOrderPage() {
  return (
    <>
      <PageHeader title="New sales order" back={{ href: "/sales/orders", label: "Sales orders" }} />
      <DocForm kind="order" initial={emptyDoc()} />
    </>
  );
}
