"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatDate, toDateInput } from "@gc/shared";
import { PageHeader } from "@/components/common/page-header";
import { DataTable } from "@/components/common/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { EntitySelect } from "@/components/common/entity-select";
import { FieldShell } from "@/components/common/form-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BatchSelect, GodownSelect, ProductPicker, QtyInput, QtyText, type ProductLite } from "@/components/inventory/pickers";
import { api, ApiError, newIdempotencyKey, useApi, useApiMutation } from "@/lib/api";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

interface SampleLine {
  id: string;
  qtyPcs: number;
  returnedPcs: number;
  closedPcs: number;
  product: ProductLite & { images: string[] };
  batch: { batchNo: string; shadeCode: string; caliber: string };
}
interface Sample {
  id: string;
  number: string;
  date: string;
  issuedToName: string;
  phone: string | null;
  expectedReturnDate: string | null;
  status: string;
  godown: { name: string };
  party: { name: string } | null;
  lines: SampleLine[];
}

const TABS = [
  { key: "open", label: "Out now", params: { status: undefined, overdue: undefined } },
  { key: "overdue", label: "Overdue", params: { overdue: "true" } },
  { key: "closed", label: "Closed", params: { status: "CLOSED" } },
] as const;

const outPcs = (l: SampleLine) => l.qtyPcs - l.returnedPcs - l.closedPcs;
const isOverdue = (s: Sample) => s.status !== "CLOSED" && !!s.expectedReturnDate && s.expectedReturnDate.slice(0, 10) < toDateInput(new Date());

function waLink(s: Sample) {
  const digits = (s.phone ?? "").replace(/\D/g, "");
  const to = digits.length === 10 ? `91${digits}` : digits;
  const items = s.lines.filter((l) => outPcs(l) > 0).map((l) => `${l.product.name} (shade ${l.batch.shadeCode}) ${outPcs(l)} pcs`).join(", ");
  return `https://wa.me/${to}?text=${encodeURIComponent(`Hello ${s.issuedToName}, a gentle reminder to return the tile samples taken from KAILAS CERAMIX on ${formatDate(s.date)} (${s.number}): ${items}. Thank you!`)}`;
}

export default function SamplesPage() {
  const { can } = useSession();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("open");
  const [issuing, setIssuing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const params = { ...TABS.find((t) => t.key === tab)!.params, ...(tab === "open" ? {} : {}) };

  return (
    <>
      <PageHeader
        title="Samples out"
        description="Sample tiles and items lent to customers, architects and leads. Stock moves to SAMPLE until it comes back or is written off."
        actions={can("sample.write") && <Button size="sm" onClick={() => setIssuing(true)}><Plus className="size-4" /> Issue samples</Button>}
      />
      <div className="mb-3 inline-flex gap-1 rounded-lg bg-fill p-1">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={cn("rounded-md px-3 py-1.5 text-[13px] font-medium", tab === t.key ? "bg-[var(--segment-on)] shadow-sm" : "text-muted-foreground")}>
            {t.label}
          </button>
        ))}
      </div>
      <DataTable<Sample>
        key={tab}
        endpoint="/samples"
        params={tab === "open" ? { status: undefined } : (params as Record<string, string>)}
        exportName="samples"
        searchPlaceholder="Search number, name, phone…"
        onRowClick={(r) => setOpenId(r.id)}
        columns={[
          { accessorKey: "number", header: "Number", cell: ({ row }) => <span className="font-medium">{row.original.number}</span> },
          { accessorKey: "date", header: "Date", cell: ({ row }) => formatDate(row.original.date), meta: { sortKey: "date", exportValue: (r) => formatDate(r.date) } },
          { accessorKey: "issuedToName", header: "Given to", cell: ({ row }) => <div><div>{row.original.issuedToName}</div><div className="text-[12px] text-muted-foreground">{row.original.phone}</div></div> },
          { id: "items", header: "Out now", cell: ({ row }) => row.original.lines.filter((l) => outPcs(l) > 0).map((l) => `${l.product.sku} ×${outPcs(l)}`).join(", ") || "—", meta: { exportValue: (r) => r.lines.map((l) => `${l.product.sku} ×${outPcs(l)}`).join(", ") } },
          {
            id: "due",
            header: "Return by",
            cell: ({ row }) => <span className={isOverdue(row.original) ? "font-medium text-ios-red" : undefined}>{formatDate(row.original.expectedReturnDate)}</span>,
            meta: { exportValue: (r) => formatDate(r.expectedReturnDate) },
          },
          { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={isOverdue(row.original) ? "OVERDUE" : row.original.status === "OPEN" ? "PENDING" : row.original.status === "CLOSED" ? "COMPLETED" : "PARTIAL"} label={isOverdue(row.original) ? "Overdue" : row.original.status === "OPEN" ? "Out" : row.original.status === "CLOSED" ? "Closed" : "Part returned"} /> },
        ]}
      />
      {issuing && <IssueDialog onClose={() => setIssuing(false)} />}
      {openId && <SampleDialog id={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

interface IssueLine {
  key: string;
  productId: string | null;
  product: ProductLite | null;
  batchId: string | null;
  qtyPcs: number;
}

function IssueDialog({ onClose }: { onClose: () => void }) {
  const [godownId, setGodownId] = useState<string>("");
  const [partyId, setPartyId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [due, setDue] = useState(toDateInput(new Date(Date.now() + 7 * 86400000)));
  const [lines, setLines] = useState<IssueLine[]>([{ key: "1", productId: null, product: null, batchId: null, qtyPcs: 0 }]);
  const [key] = useState(newIdempotencyKey);
  const issue = useApiMutation((body: unknown) => api("/samples", { method: "POST", body, idempotencyKey: key }), ["/samples", "/stock"]);
  const upd = (k: string, patch: Partial<IssueLine>) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)));

  const submit = () => {
    const ready = lines.filter((l) => l.productId && l.batchId && l.qtyPcs > 0);
    if (!godownId) return toast.error("Pick the godown the samples go out from");
    if (!ready.length) return toast.error("Add at least one sample with shade and pieces");
    issue.mutate(
      { godownId, partyId, issuedToName: name || null, phone: phone || null, expectedReturnDate: due || null, lines: ready.map((l) => ({ productId: l.productId, batchId: l.batchId, qtyPcs: l.qtyPcs })) },
      { onSuccess: () => { toast.success("Samples issued"); onClose(); }, onError: (e: ApiError) => toast.error(e.message) },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Issue samples</DialogTitle></DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <FieldShell label="Customer (optional)">
            <EntitySelect endpoint="/parties" params={{ type: "CUSTOMER" }} value={partyId} onChange={(id, p: any) => { setPartyId(id); if (p) { setName(p.name); setPhone(p.phone ?? ""); } }} getLabel={(p: any) => p.name} getDescription={(p: any) => p.phone} clearable />
          </FieldShell>
          <FieldShell label="From godown" required><GodownSelect value={godownId} onChange={setGodownId} /></FieldShell>
          <FieldShell label="Given to (name)"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Architect / walk-in customer" /></FieldShell>
          <FieldShell label="Phone"><Input value={phone} inputMode="tel" onChange={(e) => setPhone(e.target.value)} /></FieldShell>
          <FieldShell label="Return by"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></FieldShell>
        </div>
        <div className="mt-2 space-y-2">
          {lines.map((l) => (
            <div key={l.key} className="grid items-end gap-2 rounded-lg bg-fill/60 p-2 md:grid-cols-[1.4fr_1.4fr_1fr_auto]">
              <FieldShell label="Product"><ProductPicker value={l.productId} onChange={(id, p) => upd(l.key, { productId: id, product: p, batchId: null })} /></FieldShell>
              <FieldShell label="Shade lot"><BatchSelect productId={l.productId} godownId={godownId || null} product={l.product} value={l.batchId} onChange={(id) => upd(l.key, { batchId: id })} /></FieldShell>
              <FieldShell label="Pieces"><QtyInput product={l.product} value={l.qtyPcs} onChange={(n) => upd(l.key, { qtyPcs: n })} /></FieldShell>
              <Button variant="ghost" size="icon" aria-label="Remove line" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))}><Trash2 className="size-4" /></Button>
            </div>
          ))}
          <Button variant="secondary" size="sm" onClick={() => setLines((ls) => [...ls, { key: String(Date.now()), productId: null, product: null, batchId: null, qtyPcs: 0 }])}>
            <Plus className="size-4" /> Add item
          </Button>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={issue.isPending}>{issue.isPending ? "Saving…" : "Issue samples"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SampleDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { can } = useSession();
  const q = useApi<Sample>(`/samples/${id}`);
  const [back, setBack] = useState<Record<string, { returned: number; damaged: number; closed: number }>>({});
  const [reason, setReason] = useState("");
  const act = useApiMutation((v: { path: string; body: unknown }) => api(v.path, { method: "POST", body: v.body }), ["/samples", "/stock"]);
  const s = q.data;
  const get = (lineId: string) => back[lineId] ?? { returned: 0, damaged: 0, closed: 0 };
  const set = (lineId: string, patch: Partial<{ returned: number; damaged: number; closed: number }>) => setBack((b) => ({ ...b, [lineId]: { ...get(lineId), ...patch } }));

  const doReturn = () => {
    const lines = Object.entries(back).filter(([, v]) => v.returned + v.damaged > 0).map(([lineId, v]) => ({ lineId, returnedPcs: v.returned, damagedPcs: v.damaged }));
    if (!lines.length) return toast.error("Enter pieces that came back");
    act.mutate({ path: `/samples/${id}/return`, body: { lines } }, { onSuccess: () => { toast.success("Return recorded"); setBack({}); q.refetch(); }, onError: (e) => toast.error(e.message) });
  };
  const doClose = () => {
    const lines = Object.entries(back).filter(([, v]) => v.closed > 0).map(([lineId, v]) => ({ lineId, closedPcs: v.closed }));
    if (!lines.length) return toast.error("Enter pieces to write off");
    act.mutate({ path: `/samples/${id}/close`, body: { lines, reason } }, { onSuccess: () => { toast.success("Written off"); setBack({}); q.refetch(); }, onError: (e) => toast.error(e.message) });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{s ? `${s.number} · ${s.issuedToName}` : "Samples"}</DialogTitle></DialogHeader>
        {!s ? (
          <p className="text-[13px] text-muted-foreground">Loading…</p>
        ) : (
          <>
            <p className="text-[13px] text-muted-foreground">
              From {s.godown.name} on {formatDate(s.date)} · return by {formatDate(s.expectedReturnDate) || "—"}
              {s.phone && isOverdue(s) && (
                <> · <a className="text-tint hover:underline" href={waLink(s)} target="_blank" rel="noreferrer">Send WhatsApp reminder</a></>
              )}
            </p>
            <div className="divide-y divide-border">
              {s.lines.map((l) => (
                <div key={l.id} className="grid gap-2 py-2 md:grid-cols-[1.6fr_repeat(3,1fr)] md:items-center">
                  <div>
                    <div className="font-medium">{l.product.name}</div>
                    <div className="text-[12px] text-muted-foreground">
                      {l.product.sku} · shade {l.batch.shadeCode} · out <QtyText pcs={outPcs(l)} product={l.product} /> (of {l.qtyPcs})
                    </div>
                  </div>
                  {can("sample.write") && outPcs(l) > 0 && (
                    <>
                      <Input type="number" min={0} aria-label="Returned good" placeholder="Back good" value={get(l.id).returned || ""} onChange={(e) => set(l.id, { returned: Math.max(0, Math.trunc(+e.target.value || 0)) })} />
                      <Input type="number" min={0} aria-label="Returned damaged" placeholder="Back damaged" value={get(l.id).damaged || ""} onChange={(e) => set(l.id, { damaged: Math.max(0, Math.trunc(+e.target.value || 0)) })} />
                      <Input type="number" min={0} aria-label="Write off" placeholder="Kept / lost" value={get(l.id).closed || ""} onChange={(e) => set(l.id, { closed: Math.max(0, Math.trunc(+e.target.value || 0)) })} />
                    </>
                  )}
                </div>
              ))}
            </div>
            {can("sample.write") && s.status !== "CLOSED" && (
              <div className="space-y-2">
                <Input placeholder="Reason for write-off (kept by customer, lost…)" value={reason} onChange={(e) => setReason(e.target.value)} />
                <DialogFooter>
                  <Button variant="secondary" onClick={doClose} disabled={act.isPending}>Write off kept / lost</Button>
                  <Button onClick={doReturn} disabled={act.isPending}>Record return</Button>
                </DialogFooter>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
