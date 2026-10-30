"use client";

import { PageHeader } from "@/components/common/page-header";
import { DocForm, emptyDoc } from "@/components/sales/doc-form";

export default function NewInvoicePage() {
  return (
    <>
      <PageHeader title="New invoice" back={{ href: "/sales/invoices", label: "Invoices" }} description="Search product by SKU, name or size; pick the shade; Enter moves to the next field, Ctrl+S saves." />
      <DocForm kind="invoice" initial={emptyDoc()} />
    </>
  );
}
