"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingPage } from "@/components/common/states";
import { useApi } from "@/lib/api";

// Credit notes open their sales return (which shows the credit note).
export default function CreditNoteRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const q = useApi<{ items: { id: string; salesReturnId: string | null }[] }>("/credit-notes", { pageSize: 10000 });
  useEffect(() => {
    const cn = q.data?.items.find((c) => c.id === id);
    if (cn?.salesReturnId) router.replace(`/sales/returns/${cn.salesReturnId}`);
    else if (q.data) router.replace("/sales/returns");
  }, [q.data, id, router]);
  return <LoadingPage />;
}
