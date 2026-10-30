"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { formatDate, formatDateTime, formatQty, labelOf } from "@gc/shared";
import { InfoGrid, PageHeader, Section } from "@/components/common/page-header";
import { ErrorState, LoadingPage } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { LinesTable } from "@/components/inventory/doc-actions";
import { QtyInput, RackSelect } from "@/components/inventory/pickers";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api, ApiError, newIdempotencyKey, useApi } from "@/lib/api";
import { Can } from "@/lib/session";

interface Line {
  id: string;
  qtyPcs: number;
  receivedPcs: number | null;
  damagedPcs: number;
  fromStockType: string;
  toStockType: string;
  toRackId: string | null;
  text: string;
  weightKg: number;
  product: { id: string; sku: string; name: string; uomType: string; unitName: string | null; pcsPerBox: number | null; sqftPerBox: number | null };
  batch: { batchNo: string; shadeCode: string; caliber: string; grade: string };
}
interface Transfer {
  id: string;
  number: string;
  date: string;
  status: string;
  notes: string | null;
  toBranchId: string | null;
  transitState: string | null;
  vehicleNo: string | null;
  driverName: string | null;
  receivedAt: string | null;
  canReceive: boolean;
  totalWeightKg: number;
  fromGodown: { id: string; name: string; branch: { code: string; name: string } };
  toGodown: { id: string; name: string; branch: { code: string; name: string } };
  lines: Line[];
}

function ReceiveDialog({ t, onClose, onDone }: { t: Transfer; onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState(() => Object.fromEntries(t.lines.map((l) => [l.id, { receivedPcs: l.qtyPcs, damagedPcs: 0, toRackId: l.toRackId }])));
  const [busy, setBusy] = useState(false);
  const [key] = useState(newIdempotencyKey);
  const submit = async () => {
    setBusy(true);
    try {
      await api(`/stock/transfers/${t.id}/receive`, { method: "POST", idempotencyKey: key, body: { lines: Object.entries(rows).map(([lineId, r]) => ({ lineId, ...r })) } });
      toast.success("Transfer received");
      onDone();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not receive");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Receive {t.number}</DialogTitle>
        </DialogHeader>
        <p className="text-[13px] text-muted-foreground">Enter what arrived in good condition and what is broken. Anything not entered is booked as short; broken and short pieces become a transit breakage entry.</p>
        <div className="space-y-3">
          {t.lines.map((l) => {
            const r = rows[l.id];
            const short = l.qtyPcs - r.receivedPcs - r.damagedPcs;
            return (
              <div key={l.id} className="rounded-lg bg-fill p-3">
                <div className="font-medium">{l.product.name}</div>
                <div className="mb-2 text-[12px] text-muted-foreground">
                  Shade {l.batch.shadeCode} · {l.batch.batchNo} · sent {l.text}
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <label className="text-[12px]">
                    Received good
                    <QtyInput product={l.product as never} value={r.receivedPcs} onChange={(n) => setRows((x) => ({ ...x, [l.id]: { ...r, receivedPcs: n } }))} />
                  </label>
                  <label className="text-[12px]">
                    Broken
                    <QtyInput product={l.product as never} value={r.damagedPcs} onChange={(n) => setRows((x) => ({ ...x, [l.id]: { ...r, damagedPcs: n } }))} />
                  </label>
                  <label className="text-[12px]">
                    Put in rack
                    <RackSelect godownId={t.toGodown.id} value={r.toRackId} onChange={(id) => setRows((x) => ({ ...x, [l.id]: { ...r, toRackId: id } }))} emptyLabel="No rack" />
                  </label>
                </div>
                {short !== 0 && <p className={short < 0 ? "mt-1 text-[12px] text-ios-red" : "mt-1 text-[12px] text-ios-orange"}>{short < 0 ? "More than was sent" : `Short: ${formatQty(short, l.product)}`}</p>}
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Saving…" : "Receive stock"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function TransferDetailPage() {
  const { id } = useParams<{ id: string }>();
  const q = useApi<Transfer>(`/stock/transfers/${id}`);
  const [receiving, setReceiving] = useState(false);
  if (q.isLoading) return <LoadingPage />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const t = q.data;
  const inter = !!t.toBranchId;
  return (
    <>
      <PageHeader
        title={`Transfer ${t.number}`}
        back={{ href: "/inventory/transfers", label: "Transfers" }}
        description={`${t.fromGodown.branch.code} · ${t.fromGodown.name} → ${t.toGodown.branch.code} · ${t.toGodown.name}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={t.status} />
            {t.transitState && <StatusBadge status={t.transitState === "IN_TRANSIT" ? "PENDING" : "COMPLETED"} label={t.transitState === "IN_TRANSIT" ? "In transit" : "Received"} />}
            {t.canReceive && (
              <Can perm="stock.transfer">
                <Button size="sm" onClick={() => setReceiving(true)}>Receive</Button>
              </Can>
            )}
          </div>
        }
      />
      <Section className="mb-4">
        <InfoGrid
          items={[
            { label: "Date", value: formatDate(t.date) },
            { label: "Type", value: inter ? "Inter-branch" : "Within branch" },
            { label: "Vehicle", value: t.vehicleNo ?? "—" },
            { label: "Driver", value: t.driverName ?? "—" },
            { label: "Load weight", value: t.totalWeightKg ? `${t.totalWeightKg.toLocaleString("en-IN")} kg` : "—" },
            ...(t.receivedAt ? [{ label: "Received", value: formatDateTime(t.receivedAt) }] : []),
          ]}
        />
        {t.notes && <p className="mt-3 text-[13px] text-muted-foreground">{t.notes}</p>}
      </Section>
      <Section title="Lines">
        <LinesTable head={["Product", "Shade / batch", "Move", "Quantity", "Weight", ...(inter ? ["Received", "Broken"] : [])]}>
          {t.lines.map((l) => (
            <tr key={l.id} className="border-b border-border/60">
              <td className="p-2">
                <div className="font-medium">{l.product.name}</div>
                <div className="text-[12px] text-muted-foreground">{l.product.sku}</div>
              </td>
              <td className="p-2 text-[13px]">
                {l.batch.shadeCode} · {l.batch.batchNo} · cal {l.batch.caliber} · {labelOf(l.batch.grade)}
              </td>
              <td className="p-2 text-[13px]">{inter ? "Saleable → in transit" : `${labelOf(l.fromStockType)} → ${labelOf(l.toStockType)}`}</td>
              <td className="p-2 tabular">{l.text}</td>
              <td className="p-2 tabular">{l.weightKg ? `${l.weightKg} kg` : "—"}</td>
              {inter && <td className="p-2 tabular">{l.receivedPcs === null ? "—" : formatQty(l.receivedPcs, l.product)}</td>}
              {inter && <td className="p-2 tabular">{l.damagedPcs ? formatQty(l.damagedPcs, l.product) : "—"}</td>}
            </tr>
          ))}
        </LinesTable>
      </Section>
      {receiving && (
        <ReceiveDialog
          t={t}
          onClose={() => setReceiving(false)}
          onDone={() => {
            setReceiving(false);
            q.refetch();
          }}
        />
      )}
    </>
  );
}
