"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { labelOf, PAYMENT_MODES, toDateInput } from "@gc/shared";
import { PageHeader, Section } from "@/components/common/page-header";
import { FieldShell, FormGrid, MoneyInput, NativeSelect } from "@/components/common/form-fields";
import { EmptyState, LoadingRows } from "@/components/common/states";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { PartyPicker } from "@/components/accounts/party-picker";
import { AllocationGrid, autoAllocate, type OpenDoc } from "@/components/accounts/allocation-grid";
import { api, ApiError, newIdempotencyKey, useApi } from "@/lib/api";
import { useFormKeys } from "@/hooks/use-form-keys";

interface OpenBill {
  id: string;
  number: string;
  supplierInvoiceNo: string;
  date: string;
  totalPaise: number;
  duePaise: number;
}

export default function NewPaymentPage() {
  const router = useRouter();
  const [partyId, setPartyId] = useState<string | null>(null);
  const [mode, setMode] = useState("NEFT");
  const [date, setDate] = useState(toDateInput());
  const [amount, setAmount] = useState(0);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [alloc, setAlloc] = useState<Record<string, number>>({});
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [key] = useState(newIdempotencyKey);

  const open = useApi<OpenBill[]>(partyId ? `/payments/open-bills/${partyId}` : null);
  const docs: OpenDoc[] = useMemo(() => (open.data ?? []).map((b) => ({ id: b.id, label: `${b.supplierInvoiceNo} (${b.number})`, date: b.date, totalPaise: b.totalPaise, duePaise: b.duePaise })), [open.data]);
  useEffect(() => {
    if (!touched) setAlloc(autoAllocate(docs, amount));
  }, [docs, amount, touched]);

  const save = async () => {
    if (!partyId || amount <= 0) {
      toast.error("Choose a supplier and enter the amount");
      return;
    }
    setSaving(true);
    try {
      const allocations = Object.entries(alloc).filter(([, v]) => v > 0).map(([purchaseInvoiceId, amountPaise]) => ({ purchaseInvoiceId, amountPaise }));
      const p = await api<{ id: string; number: string }>("/payments", {
        method: "POST",
        idempotencyKey: key,
        body: { partyId, mode, date: new Date(`${date}T12:00:00+05:30`).toISOString(), amountPaise: amount, reference: reference || null, notes: notes || null, allocationMode: allocations.length ? "MANUAL" : "NONE", allocations },
      });
      toast.success(`Payment ${p.number} saved`);
      router.replace(`/accounts/payments/${p.id}`);
    } catch (e) {
      setSaving(false);
      toast.error(e instanceof ApiError ? e.message : "Could not save payment");
    }
  };
  const ref = useFormKeys<HTMLFormElement>(save);

  return (
    <>
      <PageHeader title="New supplier payment" back={{ href: "/accounts/payments", label: "Payments" }} />
      <form ref={ref} onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-4">
        <Section>
          <FormGrid>
            <FieldShell label="Supplier" required>
              <PartyPicker type="SUPPLIER" value={partyId} onChange={(id) => { setPartyId(id); setTouched(false); }} autoFocus />
            </FieldShell>
            <FieldShell label="Date" required>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </FieldShell>
            <FieldShell label="Mode" required>
              <NativeSelect value={mode} onChange={(e) => setMode(e.target.value)}>
                {PAYMENT_MODES.map((m) => <option key={m} value={m}>{labelOf(m)}</option>)}
              </NativeSelect>
            </FieldShell>
            <FieldShell label="Amount paid" required>
              <MoneyInput value={amount || null} onChange={setAmount} />
            </FieldShell>
            <FieldShell label="Reference / UTR / cheque no.">
              <Input value={reference} onChange={(e) => setReference(e.target.value)} />
            </FieldShell>
            <FieldShell label="Notes">
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </FieldShell>
          </FormGrid>
        </Section>
        {partyId && (
          <Section title="Allocate to purchase bills">
            {open.isLoading ? <LoadingRows rows={3} /> : !docs.length ? <EmptyState title="No open bills" description="The payment will be kept as an advance to the supplier." className="py-6" /> : <AllocationGrid docs={docs} alloc={alloc} amountPaise={amount} onChange={(a) => { setTouched(true); setAlloc(a); }} />}
          </Section>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save payment"}</Button>
        </div>
      </form>
    </>
  );
}
