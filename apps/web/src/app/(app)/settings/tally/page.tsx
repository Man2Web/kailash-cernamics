"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, KeyRound, Plus } from "lucide-react";
import { formatDate, formatDateTime, formatINR, labelOf, SYNC_STATUSES, toDateInput } from "@gc/shared";
import { PageHeader, Section } from "@/components/common/page-header";
import { DataTable } from "@/components/common/data-table";
import { EmptyState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, newIdempotencyKey, useApi, useApiMutation } from "@/lib/api";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

interface Agent {
  id: string;
  branchId: string;
  name: string;
  apiKeyPrefix: string;
  lastSeenAt: string | null;
  lastAlterId: number;
  tallyVersion: string | null;
  companyName: string | null;
  tallyRunning: boolean | null;
  isActive: boolean;
}
interface QueueRow {
  id: string;
  entityType: string;
  entityId: string;
  priority: number;
  status: string;
  attempts: number;
  nextAttemptAt: string;
  lastError: string | null;
  tallyGuid: string | null;
  createdAt: string;
}
interface Recon {
  date: string;
  rows: { type: string; erpCount: number; erpValuePaise: number; tallyCount: number; tallyValuePaise: number; matched: boolean }[];
}

const ENTITY_TYPES = ["LEDGER", "STOCK_ITEM", "INVOICE", "INVOICE_CANCEL", "CREDIT_NOTE", "PURCHASE_INVOICE", "DEBIT_NOTE", "RECEIPT", "RECEIPT_CANCEL", "PAYMENT", "PAYMENT_CANCEL"];

function KeyDialog({ apiKey, onClose }: { apiKey: string; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agent key</DialogTitle>
          <DialogDescription>Copy this key into the agent's appsettings.json (ApiKey). It is shown only once; rotate it if lost.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input readOnly value={apiKey} className="font-mono text-[12px]" onFocus={(e) => e.target.select()} />
          <Button variant="secondary" onClick={() => { navigator.clipboard.writeText(apiKey); toast.success("Copied"); }}><Copy className="size-4" /></Button>
        </div>
        <DialogFooter><Button onClick={onClose}>Done</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function TallySettingsPage() {
  const { can, branchId } = useSession();
  const [tab, setTab] = useState<"queue" | "agents" | "recon">("queue");
  const [shownKey, setShownKey] = useState<string | null>(null);
  const [day, setDay] = useState(toDateInput());
  const agents = useApi<{ items: Agent[] }>("/tally/agents");
  const health = useApi<{ pending: number; failed: number; sent: number }>("/tally/health");
  const recon = useApi<Recon>(tab === "recon" ? "/tally/reconciliation" : null, { date: day });
  const retry = useApiMutation((id: string) => api(`/tally/sync/${id}/retry`, { method: "POST", body: {} }), ["/tally"]);
  const canWrite = can("tally.write");

  const createAgent = async () => {
    const name = prompt("Name for this agent (e.g. Office Tally PC)");
    if (!name) return;
    try {
      const r = await api<{ apiKey: string }>("/tally/agents", { method: "POST", idempotencyKey: newIdempotencyKey(), body: { branchId, name } });
      setShownKey(r.apiKey);
      agents.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create agent");
    }
  };
  const rotate = async (a: Agent) => {
    if (!confirm(`Rotate the key for "${a.name}"? The old key stops working immediately.`)) return;
    try {
      const r = await api<{ apiKey: string }>(`/tally/agents/${a.id}/rotate`, { method: "POST", body: {} });
      setShownKey(r.apiKey);
      agents.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not rotate key");
    }
  };

  return (
    <>
      <PageHeader
        title="Tally sync"
        description="Two-way sync through the Windows agent on the Tally PC. Nothing is dropped silently: failed items stay here with Tally's error."
        actions={
          health.data && (
            <span className="flex gap-1.5">
              <StatusBadge status="PENDING" label={`${health.data.pending} pending`} />
              <StatusBadge status="SENT" label={`${health.data.sent} sent`} />
              <StatusBadge status={health.data.failed ? "FAILED" : "SUCCESS"} label={`${health.data.failed} failed`} />
            </span>
          )
        }
      />
      <div className="mb-3 inline-flex gap-1 rounded-lg bg-fill p-1">
        {([["queue", "Sync queue"], ["agents", "Agents"], ["recon", "Reconciliation"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("rounded-md px-3 py-1.5 text-[13px] font-medium", tab === k ? "bg-[var(--segment-on)] shadow-sm" : "text-muted-foreground")}>{l}</button>
        ))}
      </div>

      {tab === "queue" && (
        <DataTable<QueueRow>
          endpoint="/tally/sync"
          exportName="tally-sync-queue"
          searchPlaceholder="Search type, id or error…"
          filters={[
            { key: "status", label: "Status", options: SYNC_STATUSES.map((s) => ({ value: s, label: labelOf(s) })) },
            { key: "entityType", label: "Type", options: ENTITY_TYPES.map((s) => ({ value: s, label: labelOf(s) })) },
          ]}
          rowActions={canWrite ? [{ label: "Retry now", onSelect: (r) => retry.mutate(r.id, { onSuccess: () => toast.success("Queued again"), onError: (e) => toast.error(e.message) }), hidden: (r) => r.status === "SUCCESS" }] : undefined}
          columns={[
            { accessorKey: "createdAt", header: "Queued", meta: { exportValue: (r) => formatDateTime(r.createdAt) }, cell: ({ row }) => formatDateTime(row.original.createdAt) },
            { accessorKey: "entityType", header: "Type", cell: ({ row }) => <span className="font-medium">{labelOf(row.original.entityType)}</span> },
            { accessorKey: "entityId", header: "ERP id", cell: ({ row }) => <span className="font-mono text-[11px] text-muted-foreground">{row.original.entityId.slice(0, 8)}</span> },
            { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status === "SUCCESS" ? "SYNCED" : row.original.status} /> },
            { accessorKey: "attempts", header: "Attempts", meta: { align: "right" } },
            { accessorKey: "nextAttemptAt", header: "Next try", meta: { exportValue: (r) => formatDateTime(r.nextAttemptAt) }, cell: ({ row }) => (row.original.status === "PENDING" ? formatDateTime(row.original.nextAttemptAt) : "—") },
            { accessorKey: "lastError", header: "Tally error", cell: ({ row }) => <span className="line-clamp-2 max-w-96 text-[12px] text-ios-red">{row.original.lastError}</span> },
          ]}
        />
      )}

      {tab === "agents" && (
        <Section title="Agents" actions={canWrite && <Button size="sm" onClick={createAgent}><Plus className="size-4" /> New agent</Button>}>
          {agents.isLoading ? <LoadingRows rows={2} /> : !agents.data?.items.length ? (
            <EmptyState title="No agent yet" description="Create an agent, copy its key, and install the Windows service on the Tally PC (see apps/tally-agent/README.md)." />
          ) : (
            <ul className="divide-y divide-border">
              {agents.data.items.map((a) => {
                const silent = !a.lastSeenAt || Date.now() - new Date(a.lastSeenAt).getTime() > 15 * 60_000;
                return (
                  <li key={a.id} id={a.id} className="flex flex-col gap-2 py-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="font-medium">{a.name} <span className="font-mono text-[11px] text-muted-foreground">{a.apiKeyPrefix}…</span></div>
                      <div className="text-[12px] text-muted-foreground">
                        {a.companyName ?? "—"} · {a.tallyVersion ?? "version unknown"} · last AlterID {a.lastAlterId}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={silent ? "FAILED" : a.tallyRunning ? "SUCCESS" : "PENDING"} label={silent ? (a.lastSeenAt ? `Silent since ${formatDateTime(a.lastSeenAt)}` : "Never connected") : a.tallyRunning ? `Online · ${formatDateTime(a.lastSeenAt)}` : "Agent online, Tally closed"} />
                      {canWrite && <Button size="sm" variant="secondary" onClick={() => rotate(a)}><KeyRound className="size-4" /> Rotate key</Button>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      )}

      {tab === "recon" && (
        <Section title="Daily reconciliation (ERP vs synced to Tally)" actions={<Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="h-8 w-40" />}>
          {recon.isLoading ? <LoadingRows rows={3} /> : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
                  <th className="py-2 font-medium">Vouchers on {formatDate(`${day}T12:00:00+05:30`)}</th>
                  <th className="py-2 text-right font-medium">ERP count</th>
                  <th className="py-2 text-right font-medium">ERP value</th>
                  <th className="py-2 text-right font-medium">In Tally</th>
                  <th className="py-2 text-right font-medium">Tally value</th>
                  <th className="py-2 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {recon.data?.rows.map((r) => (
                  <tr key={r.type} className="border-b border-border/60">
                    <td className="py-2 font-medium">{r.type}</td>
                    <td className="py-2 text-right tabular">{r.erpCount}</td>
                    <td className="py-2 text-right tabular">{formatINR(r.erpValuePaise)}</td>
                    <td className="py-2 text-right tabular">{r.tallyCount}</td>
                    <td className="py-2 text-right tabular">{formatINR(r.tallyValuePaise)}</td>
                    <td className="py-2 text-right"><StatusBadge status={r.matched ? "SUCCESS" : "PENDING"} label={r.matched ? "Matched" : "Not yet synced"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      )}
      {shownKey && <KeyDialog apiKey={shownKey} onClose={() => setShownKey(null)} />}
    </>
  );
}
