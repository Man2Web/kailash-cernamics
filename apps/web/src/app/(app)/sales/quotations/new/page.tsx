"use client";

import { PageHeader } from "@/components/common/page-header";
import { QuoteBuilder, emptyQuote } from "@/components/sales/quote-builder";

export default function NewQuotationPage() {
  return (
    <>
      <PageHeader title="New quotation" back={{ href: "/sales/quotations", label: "Quotations" }} description="Add rooms and their floor/wall areas; boxes and totals update as you type." />
      <QuoteBuilder initial={emptyQuote()} />
    </>
  );
}
