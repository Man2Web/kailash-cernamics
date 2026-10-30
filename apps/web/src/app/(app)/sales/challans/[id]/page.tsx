"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Truck } from "lucide-react";
import { formatDate, formatDateTime, formatINR } from "@gc/shared";
import { PageHeader, Section } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { ErrorState, LoadingPage } from "@/components/common/states";
import { FieldShell, MoneyInput } from "@/components/common/form-fields";
import { EntitySelect } from "@/components/common/entity-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtQty } from "@/components/sales/sales-kit";
import { api, uploadFile, useApi } from "@/lib/api";
import { useSession } from "@/lib/session";

export default function ChallanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const { can } = useSession();
  const q = useApi<any>(`/challans/${id}`);
  const [open, setOpen] = useState(false);
  const [d, setD] = useState({ vehicleId: null as string | null, vehicleNo: "", driverName: "", driverPhone: "", loadingPaise: 0, unloadingPaise: 0 });
  const [busy, setBusy] = useState(false);

  if (q.isLoading) return <LoadingPage />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const c = q.data;
  const refresh = () => qc.invalidateQueries();

  const dispatch = async () => {
    setBusy(true);
    try {
      await api(`/challans/${id}/dispatch`, { method: "POST", body: { ...d, vehicleNo: d.vehicleNo || null } });
      toast.success("Dispatched");
      setOpen(false);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const deliver = async (dispatchId: string, file?: File) => {
    try {
      const pod = file ? (await uploadFile(file, "pod")).url : null;
      await api(`/dispatches/${dispatchId}/deliver`, { method: "POST", body: { podPhoto: pod } });
      toast.success("Marked delivered");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <>
      <PageHeader
        back={{ href: "/sales/challans", label: "Challans" }}
        title={
          <span className="flex items-center gap-2">
            {c.number} <StatusBadge status={c.status} label={c.status === "COMPLETED" ? "Delivered" : c.status === "POSTED" ? "Ready" : undefined} />
          </span>
        }
        description={`${c.party?.name} · ${formatDate(c.date)}${c.site ? ` · site ${c.site.name}` : ""}`}
        actions={
          <>
            {c.invoice && (
              <Button asChild size="sm" variant="secondary">
                <Link href={`/sales/invoices/${c.invoice.id}`}>Invoice {c.invoice.number}</Link>
              </Button>
            )}
            {c.status === "POSTED" && can("dispatch.write") && (
              <Button size="sm" onClick={() => setOpen(true)}>
                <Truck className="size-4" /> Dispatch
              </Button>
            )}
            {c.status === "POSTED" && can("dispatch.write") && (
              <Button size="sm" variant="secondary" onClick={async () => { if (confirm("Cancel this challan?")) { await api(`/challans/${id}/cancel`, { method: "POST", body: {} }).catch((e) => toast.error(e.message)); refresh(); } }}>
                Cancel
              </Button>
            )}
          </>
        }
      />
      <div className="space-y-4">
        <Section title="Items" actions={c.totalWeightKg ? <span className="text-[13px] text-muted-foreground">Load weight <b className="text-foreground tabular">{Number(c.totalWeightKg).toLocaleString("en-IN")} kg</b></span> : undefined}>
          <ul className="divide-y divide-border text-[13px]">
            {c.lines.map((l: any) => (
              <li key={l.id} className="flex items-center justify-between gap-2 py-2">
                <div>
                  <div className="font-medium">{l.product.name}</div>
                  <div className="text-[12px] text-muted-foreground">
                    {l.product.sku}
                    {l.batch && l.batch.batchNo !== "DEFAULT" ? ` · shade ${l.batch.shadeCode} · ${l.batch.batchNo}` : ""}
                  </div>
                </div>
                <span className="text-right">
                  <span className="block font-medium tabular">{fmtQty(l.qtyPcs, l.product)}</span>
                  {c.lineWeights?.find((w: any) => w.lineId === l.id)?.weightKg ? <span className="block text-[11px] text-muted-foreground tabular">{c.lineWeights.find((w: any) => w.lineId === l.id).weightKg} kg</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Dispatches">
          {!c.dispatches.length ? (
            <p className="text-[13px] text-muted-foreground">Not dispatched yet.</p>
          ) : (
            <ul className="divide-y divide-border text-[13px]">
              {c.dispatches.map((x: any) => (
                <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <div className="font-medium">
                      {x.vehicle?.number ?? "Own vehicle"} · {x.driverName ?? "—"} {x.driverPhone ? `(${x.driverPhone})` : ""}
                    </div>
                    <div className="text-[12px] text-muted-foreground">
                      Sent {formatDateTime(x.dispatchedAt)} · loading {formatINR(x.loadingPaise)} · unloading {formatINR(x.unloadingPaise)}
                    </div>
                  </div>
                  {x.deliveredAt ? (
                    <span className="flex items-center gap-2">
                      <StatusBadge status="COMPLETED" label={`Delivered ${formatDate(x.deliveredAt)}`} />
                      {x.podPhoto && (
                        <a className="text-tint hover:underline" href={x.podPhoto} target="_blank" rel="noopener">
                          POD photo
                        </a>
                      )}
                    </span>
                  ) : (
                    can("dispatch.write") && (
                      <span className="flex items-center gap-2">
                        <label className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-fill px-2 py-1 text-[12.5px] hover:bg-fill-strong">
                          <Camera className="size-4" /> Delivered with photo
                          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && deliver(x.id, e.target.files[0])} />
                        </label>
                        <Button size="sm" variant="secondary" className="h-7" onClick={() => deliver(x.id)}>
                          Delivered
                        </Button>
                      </span>
                    )
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Dispatch {c.number}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <FieldShell label="Vehicle (saved)">
              <EntitySelect<any> endpoint="/vehicles" value={d.vehicleId} clearable onChange={(vid, v) => setD((s) => ({ ...s, vehicleId: vid, driverName: v?.driverName ?? s.driverName, driverPhone: v?.driverPhone ?? s.driverPhone }))} getLabel={(v) => v.number} placeholder="Pick vehicle" />
            </FieldShell>
            <FieldShell label="…or vehicle number">
              <Input value={d.vehicleNo} disabled={!!d.vehicleId} placeholder="TN 37 AB 1234" onChange={(e) => setD((s) => ({ ...s, vehicleNo: e.target.value }))} />
            </FieldShell>
            <FieldShell label="Driver">
              <Input value={d.driverName} onChange={(e) => setD((s) => ({ ...s, driverName: e.target.value }))} />
            </FieldShell>
            <FieldShell label="Driver phone">
              <Input inputMode="tel" value={d.driverPhone} onChange={(e) => setD((s) => ({ ...s, driverPhone: e.target.value }))} />
            </FieldShell>
            <FieldShell label="Loading charges">
              <MoneyInput value={d.loadingPaise} onChange={(p) => setD((s) => ({ ...s, loadingPaise: p }))} />
            </FieldShell>
            <FieldShell label="Unloading charges">
              <MoneyInput value={d.unloadingPaise} onChange={(p) => setD((s) => ({ ...s, unloadingPaise: p }))} />
            </FieldShell>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={dispatch} disabled={busy}>
              {busy ? "Saving…" : "Dispatch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
