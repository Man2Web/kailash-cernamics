"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { stateName, toDateInput } from "@gc/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Section } from "@/components/common/page-header";
import { FieldShell, MoneyInput } from "@/components/common/form-fields";
import { useDraft, useFormKeys } from "@/hooks/use-form-keys";
import { useSession } from "@/lib/session";
import {
  CustomerFields,
  emptyLine,
  LinesEditor,
  linesPayload,
  SalesConflict,
  salesSave,
  SplitDialog,
  TotalsPanel,
  useDocTotals,
  useInterState,
  useParty,
  type EditLine,
  type ShortageInfo,
} from "./sales-kit";

export interface DocFormValues {
  partyId: string | null;
  siteId: string | null;
  influencerId: string | null;
  date: string;
  deliveryDate?: string;
  notes: string;
  transportPaise: number;
  loadingPaise: number;
  lines: EditLine[];
}

export function emptyDoc(): DocFormValues {
  return { partyId: null, siteId: null, influencerId: null, date: toDateInput(new Date()), notes: "", transportPaise: 0, loadingPaise: 0, lines: [emptyLine()] };
}

/**
 * Keyboard-first editor for sales orders and invoices: customer + site, product search, shade picker
 * with free boxes per batch, boxes + loose pcs, live GST totals. Enter → next field, Ctrl+S saves.
 */
export function DocForm({ kind, initial, docId }: { kind: "order" | "invoice"; initial: DocFormValues; docId?: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { can } = useSession();
  const [v, setV] = useState<DocFormValues>(initial);
  const [saving, setSaving] = useState(false);
  const [shortage, setShortage] = useState<ShortageInfo | null>(null);
  const party = useParty(v.partyId);
  const { interState, placeOfSupply } = useInterState(party.data);
  const totals = useDocTotals(v.lines, interState, v.transportPaise + v.loadingPaise);
  const draft = useDraft(docId ? null : `sales-${kind}`, v);
  const setLines = (fn: (l: EditLine[]) => EditLine[]) => setV((s) => ({ ...s, lines: fn(s.lines) }));
  const base = kind === "order" ? "/sales-orders" : "/invoices";
  const page = kind === "order" ? "/sales/orders" : "/sales/invoices";

  const save = async (action: "draft" | "confirm") => {
    if (!v.partyId) return toast.error("Pick a customer");
    const lines = linesPayload(v.lines);
    if (!lines.length) return toast.error("Add at least one line with quantity");
    setSaving(true);
    try {
      const body = {
        partyId: v.partyId,
        siteId: v.siteId,
        influencerId: v.influencerId,
        date: v.date ? new Date(`${v.date}T12:00:00+05:30`) : undefined,
        deliveryDate: v.deliveryDate ? new Date(`${v.deliveryDate}T12:00:00+05:30`) : undefined,
        notes: v.notes || null,
        transportPaise: v.transportPaise,
        loadingPaise: v.loadingPaise,
        lines,
        ...(kind === "order" ? { confirm: action === "confirm" } : { post: action === "confirm" }),
      };
      const saved = await salesSave<{ id: string; status: string; number?: string }>(docId ? `${base}/${docId}` : base, docId ? "PATCH" : "POST", body);
      draft.clear();
      qc.invalidateQueries();
      toast.success(
        kind === "order"
          ? saved.status === "PENDING_APPROVAL"
            ? "Order saved and sent for approval"
            : action === "confirm"
              ? "Order confirmed, stock reserved"
              : "Order saved as draft"
          : action === "confirm"
            ? `Invoice ${saved.number} posted`
            : "Invoice saved as draft",
      );
      router.push(`${page}/${saved.id}`);
    } catch (e) {
      if (e instanceof SalesConflict) {
        setShortage(e.body);
        toast.warning(e.message);
      } else toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const ref = useFormKeys<HTMLFormElement>(() => save("draft"));
  const shortLine = shortage ? v.lines.find((l) => l.productId === shortage.productId && !l.batchId) ?? v.lines.find((l) => l.productId === shortage.productId) : null;
  const restored = !docId ? draft.load() : null;

  return (
    <form ref={ref} onSubmit={(e) => (e.preventDefault(), save("draft"))} className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-4">
        {restored && JSON.stringify(restored) !== JSON.stringify(v) && v.lines.every((l) => !l.productId) && (
          <div className="flex items-center justify-between rounded-lg bg-ios-blue/10 px-3 py-2 text-[13px]">
            <span>You have an unsaved {kind} draft.</span>
            <Button type="button" size="sm" variant="secondary" onClick={() => setV(restored)}>
              Restore
            </Button>
          </div>
        )}
        <Section>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <CustomerFields
              partyId={v.partyId}
              siteId={v.siteId}
              influencerId={v.influencerId}
              onChange={(c) => setV((s) => ({ ...s, ...c }))}
            />
            <FieldShell label={kind === "order" ? "Order date" : "Invoice date"} hint={party.data ? `Place of supply: ${stateName(placeOfSupply)} (${interState ? "IGST" : "CGST + SGST"})` : undefined}>
              <Input type="date" value={v.date} onChange={(e) => setV((s) => ({ ...s, date: e.target.value }))} />
            </FieldShell>
            {kind === "order" && (
              <FieldShell label="Delivery date">
                <Input type="date" value={v.deliveryDate ?? ""} onChange={(e) => setV((s) => ({ ...s, deliveryDate: e.target.value }))} />
              </FieldShell>
            )}
          </div>
        </Section>
        <Section title="Items">
          <LinesEditor lines={v.lines} setLines={setLines} partyId={v.partyId} interState={interState} />
        </Section>
        <Section>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <FieldShell label="Transport">
              <MoneyInput value={v.transportPaise} onChange={(p) => setV((s) => ({ ...s, transportPaise: p }))} />
            </FieldShell>
            <FieldShell label="Loading / unloading">
              <MoneyInput value={v.loadingPaise} onChange={(p) => setV((s) => ({ ...s, loadingPaise: p }))} />
            </FieldShell>
            <FieldShell label="Notes" className="md:col-span-3">
              <Textarea rows={2} value={v.notes} onChange={(e) => setV((s) => ({ ...s, notes: e.target.value }))} />
            </FieldShell>
          </div>
        </Section>
      </div>
      <div className="space-y-3 lg:sticky lg:top-20 lg:self-start">
        <TotalsPanel t={{ ...totals, chargesPaise: v.transportPaise + v.loadingPaise }} interState={interState} />
        <div className="flex flex-col gap-2">
          {kind === "order" ? (
            <Button type="button" disabled={saving || !can("order.write")} onClick={() => save("confirm")}>
              Save & confirm (reserve stock)
            </Button>
          ) : (
            <Button type="button" disabled={saving || !can("invoice.write")} onClick={() => save("confirm")}>
              Save & post invoice
            </Button>
          )}
          <Button type="submit" variant="secondary" disabled={saving}>
            {saving ? "Saving…" : "Save draft (Ctrl+S)"}
          </Button>
        </div>
      </div>
      <SplitDialog
        open={!!shortage}
        onClose={() => setShortage(null)}
        product={shortLine?.product}
        qtyPcs={shortage?.qtyPcs ?? 0}
        batches={shortage?.batches ?? []}
        onApply={(parts) => {
          if (shortLine) {
            setLines((ls) =>
              ls.flatMap((l) => (l.key === shortLine.key ? parts.map((p) => ({ ...l, key: Math.random().toString(36).slice(2), batchId: p.batchId, godownId: p.godownId, qtyPcs: p.qtyPcs })) : [l])),
            );
            toast.info("Line split across batches. Save again.");
          }
          setShortage(null);
        }}
      />
    </form>
  );
}
