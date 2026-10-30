"use client";

import { use } from "react";
import { formatDate, labelOf } from "@gc/shared";
import { InfoGrid, PageHeader, Section } from "@/components/common/page-header";
import { ErrorState, LoadingPage } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { DocActionButton, LinesTable } from "@/components/inventory/doc-actions";
import { useApi } from "@/lib/api";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

interface Adj {
  id: string;
  number: string;
  date: string;
  status: string;
  reason: string;
  godown: { name: string };
  lines: { id: string; qtyPcs: number; text: string; stockType: string; product: { sku: string; name: string }; batch: { batchNo: string; shadeCode: string } }[];
}

export default function AdjustmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = useSession();
  const q = useApi<Adj>(`/stock/adjustments/${id}`);
  if (q.isLoading) return <LoadingPage />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const a = q.data;
  return (
    <>
      <PageHeader
        title={a.number}
        back={{ href: "/inventory/adjustments", label: "Adjustments" }}
        actions={
          <>
            <StatusBadge status={a.status} />
            {a.status === "DRAFT" && can("stock.adjust") && <DocActionButton path={`/stock/adjustments/${id}/submit`} label="Submit for approval" invalidate={["/stock"]} />}
          </>
        }
      />
      <Section className="mb-4">
        <InfoGrid items={[{ label: "Date", value: formatDate(a.date) }, { label: "Godown", value: a.godown.name }, { label: "Reason", value: a.reason }, { label: "Status", value: labelOf(a.status) }]} />
        {a.status === "PENDING_APPROVAL" && <p className="mt-3 rounded-md bg-ios-orange/10 px-3 py-2 text-[13px] text-ios-orange">Waiting for approval. Stock changes only after a manager approves it in Approvals.</p>}
      </Section>
      <Section title="Lines">
        <LinesTable head={["Product", "Shade / batch", "Stock type", "Change"]}>
          {a.lines.map((l) => (
            <tr key={l.id} className="border-b border-border/60">
              <td className="p-2"><div className="font-medium">{l.product.name}</div><div className="text-[12px] text-muted-foreground">{l.product.sku}</div></td>
              <td className="p-2">{l.batch.batchNo === "DEFAULT" ? "—" : `${l.batch.shadeCode} · ${l.batch.batchNo}`}</td>
              <td className="p-2"><StatusBadge status={l.stockType} /></td>
              <td className={cn("p-2 font-medium tabular", l.qtyPcs < 0 ? "text-ios-red" : "text-ios-green")}>{l.qtyPcs > 0 ? "+" : ""}{l.text}</td>
            </tr>
          ))}
        </LinesTable>
      </Section>
    </>
  );
}
