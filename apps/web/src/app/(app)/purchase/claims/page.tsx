"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { formatDate, formatINR, labelOf } from "@gc/shared";
import { PageHeader, Section } from "@/components/common/page-header";
import { DataTable } from "@/components/common/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { EmptyState, LoadingRows } from "@/components/common/states";
import { FieldShell, MoneyInput, NativeSelect } from "@/components/common/form-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QtyText, SupplierPicker, type ProductLite } from "@/components/inventory/pickers";
import { api, ApiError, newIdempotencyKey, useApi, useApiMutation } from "@/lib/api";
import { exportToExcel } from "@/lib/export";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

interface Entry {
  id: string;
  number: string;
  date: string;
  stage: string;
  qtyPcs: number;
  reason: string;
  photos: string[];
  valuePaise: number;
  product: ProductLite;
  batch: { batchNo: string; shadeCode: string };
}
interface Claim {
  id: string;
  number: string;
  date: string;
  status: string;
  claimedPaise: number;
  settledPaise: number;
  settlementType: string | null;
  settlementRef: string | null;
  notes: string | null;
  supplier: { name: string };
  _count?: { entries: number };
  entries?: Entry[];
}
interface RateRow {
  id: string;
  name: string;
  receivedPcs: number;
  receiptPcs: number;
  transitPcs: number;
  godownPcs: number;
  customerPcs: number;
  brokenPcs: number;
  ratePct: number | null;
}

const CLAIM_TONE: Record<string, string> = { DRAFT: "DRAFT", SUBMITTED: "PENDING", SETTLED: "COMPLETED", REJECTED: "REJECTED" };

export default function ClaimsPage() {
  const { can } = useSession();
  const [tab, setTab] = useState<"claims" | "rate">("claims");
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <>
      <PageHeader
        title="Breakage claims"
        description="Claim tiles broken on receipt or in transit from the supplier, at landed cost, and track the credit note or replacement."
        actions={can("claim.write") && <Button size="sm" onClick={() => setCreating(true)}><Plus className="size-4" /> New claim</Button>}
      />
      <div className="mb-3 inline-flex gap-1 rounded-lg bg-fill p-1">
        {(["claims", "rate"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn("rounded-md px-3 py-1.5 text-[13px] font-medium", tab === t ? "bg-[var(--segment-on)] shadow-sm" : "text-muted-foreground")}>
            {t === "claims" ? "Claims" : "Breakage rate"}
          </button>
        ))}
      </div>
      {tab === "claims" ? (
        <DataTable<Claim>
          endpoint="/breakage-claims"
          exportName="breakage-claims"
          searchPlaceholder="Search claim no, supplier, reference…"
          filters={[{ key: "status", label: "Status", options: ["DRAFT", "SUBMITTED", "SETTLED", "REJECTED"].map((s) => ({ value: s, label: labelOf(s) })) }]}
          onRowClick={(r) => setOpenId(r.id)}
          columns={[
            { accessorKey: "number", header: "Claim", cell: ({ row }) => <span className="font-medium">{row.original.number}</span> },
            { accessorKey: "date", header: "Date", cell: ({ row }) => formatDate(row.original.date), meta: { sortKey: "date", exportValue: (r) => formatDate(r.date) } },
            { id: "supplier", header: "Supplier", cell: ({ row }) => row.original.supplier.name, meta: { exportValue: (r) => r.supplier.name } },
            { id: "entries", header: "Entries", cell: ({ row }) => row.original._count?.entries ?? 0, meta: { align: "right", exportValue: (r) => r._count?.entries ?? 0 } },
            { accessorKey: "claimedPaise", header: "Claimed", cell: ({ row }) => formatINR(row.original.claimedPaise), meta: { align: "right", exportValue: (r) => r.claimedPaise / 100 } },
            { accessorKey: "settledPaise", header: "Settled", cell: ({ row }) => (row.original.status === "SETTLED" ? formatINR(row.original.settledPaise) : "—"), meta: { align: "right", exportValue: (r) => r.settledPaise / 100 } },
            { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={CLAIM_TONE[row.original.status] ?? row.original.status} label={labelOf(row.original.status)} /> },
          ]}
        />
      ) : (
        <BreakageRate />
      )}
      {creating && <NewClaimDialog onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setOpenId(id); }} />}
      {openId && <ClaimDialog id={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

function BreakageRate() {
  const [groupBy, setGroupBy] = useState<"supplier" | "brand">("supplier");
  const q = useApi<RateRow[]>("/stock/breakage-rate", { groupBy });
  const rows = q.data ?? [];
  return (
    <Section
      title="Breakage rate"
      actions={
        <div className="flex gap-2">
          <NativeSelect className="h-8 w-36" value={groupBy} onChange={(e) => setGroupBy(e.target.value as "supplier" | "brand")} aria-label="Group by">
            <option value="supplier">By supplier</option>
            <option value="brand">By brand</option>
          </NativeSelect>
          <Button size="sm" variant="secondary" onClick={() => exportToExcel(`breakage-rate-${groupBy}`, [{ header: groupBy === "brand" ? "Brand" : "Supplier", key: "name" }, { header: "Received pcs", key: "receivedPcs" }, { header: "On receipt", key: "receiptPcs" }, { header: "In transit", key: "transitPcs" }, { header: "In godown", key: "godownPcs" }, { header: "At customer", key: "customerPcs" }, { header: "Broken %", key: "ratePct" }], rows as never)}>Excel</Button>
        </div>
      }
    >
      {q.isLoading ? (
        <LoadingRows />
      ) : !rows.length ? (
        <EmptyState title="No receipts or breakage yet" className="py-6" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
                <th className="py-2 pr-3">{groupBy === "brand" ? "Brand" : "Supplier"}</th>
                <th className="py-2 pr-3 text-right">Received pcs</th>
                <th className="py-2 pr-3 text-right">On receipt</th>
                <th className="py-2 pr-3 text-right">In transit</th>
                <th className="py-2 pr-3 text-right">In godown</th>
                <th className="py-2 pr-3 text-right">At customer</th>
                <th className="py-2 text-right">Broken %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60 tabular">
                  <td className="py-2 pr-3 font-medium">{r.name}</td>
                  <td className="py-2 pr-3 text-right">{r.receivedPcs}</td>
                  <td className="py-2 pr-3 text-right">{r.receiptPcs}</td>
                  <td className="py-2 pr-3 text-right">{r.transitPcs}</td>
                  <td className="py-2 pr-3 text-right">{r.godownPcs}</td>
                  <td className="py-2 pr-3 text-right">{r.customerPcs}</td>
                  <td className={cn("py-2 text-right font-medium", (r.ratePct ?? 0) > 2 && "text-ios-red")}>{r.ratePct === null ? "—" : `${r.ratePct.toFixed(2)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function NewClaimDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  const [key] = useState(newIdempotencyKey);
  const cands = useApi<Entry[]>(supplierId ? "/breakage-claims/candidates" : null, { supplierId: supplierId ?? undefined });
  const create = useApiMutation((body: unknown) => api<{ id: string; number: string }>("/breakage-claims", { method: "POST", body, idempotencyKey: key }), ["/breakage-claims"]);
  const total = (cands.data ?? []).filter((e) => picked.has(e.id)).reduce((a, e) => a + e.valuePaise, 0);
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>New breakage claim</DialogTitle></DialogHeader>
        <FieldShell label="Supplier" required><SupplierPicker value={supplierId} onChange={(id) => { setSupplierId(id); setPicked(new Set()); }} /></FieldShell>
        {supplierId && (
          cands.isLoading ? <LoadingRows rows={3} /> : !cands.data?.length ? (
            <EmptyState title="No unclaimed receipt or transit breakage for this supplier" className="py-6" />
          ) : (
            <ul className="divide-y divide-border">
              {cands.data.map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-2">
                  <Checkbox checked={picked.has(e.id)} onCheckedChange={() => toggle(e.id)} aria-label={`Claim ${e.number}`} />
                  {e.photos?.[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={e.photos[0]} alt="" className="size-10 rounded object-cover" />
                  )}
                  <div className="min-w-0 flex-1 text-[13px]">
                    <div className="font-medium">{e.product.name} · shade {e.batch.shadeCode}</div>
                    <div className="text-[12px] text-muted-foreground">
                      {e.number} · {formatDate(e.date)} · {labelOf(e.stage)} · <QtyText pcs={e.qtyPcs} product={e.product} /> · {e.reason}
                    </div>
                  </div>
                  <span className="shrink-0 text-[13px] tabular">{formatINR(e.valuePaise)}</span>
                </li>
              ))}
            </ul>
          )
        )}
        <Input placeholder="Notes for the supplier (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <DialogFooter className="items-center">
          <span className="mr-auto text-[13px]">Claim value: <b className="tabular">{formatINR(total)}</b></span>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!picked.size || create.isPending}
            onClick={() =>
              create.mutate(
                { supplierId, entryIds: [...picked], notes: notes || null },
                { onSuccess: (c) => { toast.success(`${c.number} created`); onCreated(c.id); }, onError: (e: ApiError) => toast.error(e.message) },
              )
            }
          >
            Create claim
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ClaimDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { can } = useSession();
  const q = useApi<Claim>(`/breakage-claims/${id}`);
  const [type, setType] = useState<"CREDIT_NOTE" | "REPLACEMENT" | "REJECTED">("CREDIT_NOTE");
  const [amount, setAmount] = useState<number>(0);
  const [ref, setRef] = useState("");
  const act = useApiMutation((v: { path: string; body?: unknown; method?: "POST" | "DELETE" }) => api(v.path, { method: v.method ?? "POST", body: v.body ?? (v.method === "DELETE" ? undefined : {}) }), ["/breakage-claims", "/stock"]);
  const c = q.data;
  const done = (msg: string) => () => { toast.success(msg); q.refetch(); };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{c ? `${c.number} · ${c.supplier.name}` : "Claim"}</DialogTitle></DialogHeader>
        {!c ? (
          <LoadingRows rows={3} />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 text-[13px]">
              <StatusBadge status={CLAIM_TONE[c.status]} label={labelOf(c.status)} />
              <span>Claimed <b className="tabular">{formatINR(c.claimedPaise)}</b></span>
              {c.status === "SETTLED" && <span>Settled <b className="tabular">{formatINR(c.settledPaise)}</b> by {labelOf(c.settlementType)} {c.settlementRef && `(${c.settlementRef})`}</span>}
            </div>
            {c.notes && <p className="text-[13px] text-muted-foreground">{c.notes}</p>}
            <ul className="divide-y divide-border">
              {c.entries?.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                  <div className="min-w-0">
                    <div className="font-medium">{e.product.name} · shade {e.batch.shadeCode}</div>
                    <div className="text-[12px] text-muted-foreground">{e.number} · {labelOf(e.stage)} · <QtyText pcs={e.qtyPcs} product={e.product} /></div>
                  </div>
                  <span className="tabular">{formatINR(e.valuePaise)}</span>
                </li>
              ))}
            </ul>
            {can("claim.write") && c.status === "DRAFT" && (
              <DialogFooter>
                <Button variant="secondary" onClick={() => act.mutate({ path: `/breakage-claims/${id}`, method: "DELETE" }, { onSuccess: () => { toast.success("Draft deleted"); onClose(); }, onError: (e) => toast.error(e.message) })}>Delete draft</Button>
                <Button onClick={() => act.mutate({ path: `/breakage-claims/${id}/submit` }, { onSuccess: done("Submitted to supplier"), onError: (e) => toast.error(e.message) })}>Mark submitted</Button>
              </DialogFooter>
            )}
            {can("claim.write") && ["DRAFT", "SUBMITTED"].includes(c.status) && (
              <Section title="Settle" className="bg-fill/50 shadow-none">
                <div className="grid gap-3 md:grid-cols-3">
                  <FieldShell label="Outcome">
                    <NativeSelect value={type} onChange={(e) => setType(e.target.value as typeof type)}>
                      <option value="CREDIT_NOTE">Credit note</option>
                      <option value="REPLACEMENT">Replacement stock</option>
                      <option value="REJECTED">Rejected by supplier</option>
                    </NativeSelect>
                  </FieldShell>
                  <FieldShell label="Settled value"><MoneyInput value={amount} onChange={setAmount} disabled={type === "REJECTED"} /></FieldShell>
                  <FieldShell label="Reference"><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="CN / DC no." /></FieldShell>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button onClick={() => act.mutate({ path: `/breakage-claims/${id}/settle`, body: { settlementType: type, settledPaise: amount, settlementRef: ref || null } }, { onSuccess: done("Claim closed"), onError: (e) => toast.error(e.message) })}>
                    Save settlement
                  </Button>
                </div>
              </Section>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
