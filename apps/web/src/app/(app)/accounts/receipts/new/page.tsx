"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { toast } from "sonner";
import { formatINR, labelOf, PAYMENT_MODES, toDateInput } from "@gc/shared";
import { PageHeader, Section } from "@/components/common/page-header";
import { FieldShell, MoneyInput, NativeSelect, FormGrid } from "@/components/common/form-fields";
import { EmptyState, LoadingRows } from "@/components/common/states";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { PartyPicker } from "@/components/accounts/party-picker";
import { AllocationGrid, autoAllocate, type OpenDoc } from "@/components/accounts/allocation-grid";
import { api, ApiError, newIdempotencyKey, useApi } from "@/lib/api";
import { useFormKeys, useUnsavedGuard } from "@/hooks/use-form-keys";

interface OpenInvoice {
  id: string;
  number: string;
  date: string;
  totalPaise: number;
  duePaise: number;
}
interface Credit {
  outstandingPaise: number;
  overduePaise: number;
  overdueInvoices: number;
  tallyClosingPaise: number | null;
}

function NewReceipt() {
  const router = useRouter();
  const params = useSearchParams();
  const [partyId, setPartyId] = useState<string | null>(params.get("partyId"));
  const [mode, setMode] = useState<string>("UPI");
  const [date, setDate] = useState(toDateInput());
  const [amount, setAmount] = useState<number>(0);
  const [reference, setReference] = useState("");
  const [chequeNo, setChequeNo] = useState("");
  const [chequeDate, setChequeDate] = useState("");
  const [bankName, setBankName] = useState("");
  const [notes, setNotes] = useState("");
  const [alloc, setAlloc] = useState<Record<string, number>>({});
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [key] = useState(newIdempotencyKey);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const open = useApi<OpenInvoice[]>(partyId ? `/receipts/open-invoices/${partyId}` : null);
  const credit = useApi<Credit>(partyId ? `/credit/${partyId}` : null);
  const docs: OpenDoc[] = useMemo(() => (open.data ?? []).map((i) => ({ id: i.id, label: i.number, date: i.date, totalPaise: i.totalPaise, duePaise: i.duePaise })), [open.data]);

  // re-run oldest-first allocation whenever the amount or invoices change, until the user edits rows
  useEffect(() => {
    if (!touched) setAlloc(autoAllocate(docs, amount));
  }, [docs, amount, touched]);
  useUnsavedGuard(amount > 0 && !saving);

  const allocated = Object.values(alloc).reduce((a, b) => a + (b || 0), 0);

  const save = async () => {
    const e: Record<string, string> = {};
    if (!partyId) e.party = "Choose a customer";
    if (!amount || amount <= 0) e.amount = "Enter the amount received";
    if (mode === "CHEQUE" && !chequeNo) e.chequeNo = "Cheque number is required";
    if (allocated > amount) e.alloc = "Allocated more than the amount";
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      const allocations = Object.entries(alloc).filter(([, v]) => v > 0).map(([invoiceId, amountPaise]) => ({ invoiceId, amountPaise }));
      const r = await api<{ id: string; number: string }>("/receipts", {
        method: "POST",
        idempotencyKey: key,
        body: {
          partyId,
          mode,
          date: new Date(`${date}T12:00:00+05:30`).toISOString(),
          amountPaise: amount,
          reference: reference || null,
          chequeNo: mode === "CHEQUE" ? chequeNo : null,
          chequeDate: mode === "CHEQUE" && chequeDate ? new Date(`${chequeDate}T12:00:00+05:30`).toISOString() : null,
          bankName: bankName || null,
          notes: notes || null,
          allocationMode: allocations.length ? "MANUAL" : "NONE",
          allocations,
        },
      });
      toast.success(`Receipt ${r.number} saved`);
      router.replace(`/accounts/receipts/${r.id}`);
    } catch (err) {
      setSaving(false);
      toast.error(err instanceof ApiError ? err.message : "Could not save receipt");
    }
  };
  const ref = useFormKeys<HTMLFormElement>(save);

  return (
    <>
      <PageHeader title="New receipt" back={{ href: "/accounts/receipts", label: "Receipts" }} />
      <form
        ref={ref}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="space-y-4"
      >
        <Section>
          <FormGrid>
            <FieldShell label="Customer" required error={errors.party}>
              <PartyPicker type="CUSTOMER" value={partyId} onChange={(id) => { setPartyId(id); setTouched(false); }} autoFocus />
            </FieldShell>
            <FieldShell label="Date" required>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </FieldShell>
            <FieldShell label="Mode" required>
              <NativeSelect value={mode} onChange={(e) => setMode(e.target.value)}>
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {labelOf(m)}
                  </option>
                ))}
              </NativeSelect>
            </FieldShell>
            <FieldShell label="Amount received" required error={errors.amount}>
              <MoneyInput value={amount || null} onChange={(v) => setAmount(v)} />
            </FieldShell>
            {mode === "CHEQUE" && (
              <>
                <FieldShell label="Cheque number" required error={errors.chequeNo}>
                  <Input value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} inputMode="numeric" />
                </FieldShell>
                <FieldShell label="Cheque date">
                  <Input type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} />
                </FieldShell>
              </>
            )}
            {mode !== "CASH" && (
              <FieldShell label={mode === "CHEQUE" ? "Bank" : "Bank / UPI app"}>
                <Input value={bankName} onChange={(e) => setBankName(e.target.value)} />
              </FieldShell>
            )}
            <FieldShell label={mode === "UPI" || mode === "NEFT" ? "Transaction / UTR no." : "Reference"}>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} />
            </FieldShell>
            <FieldShell label="Notes" className="md:col-span-2">
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </FieldShell>
          </FormGrid>
        </Section>

        {partyId && (
          <Section
            title="Allocate to invoices"
            actions={
              <Button type="button" variant="ghost" size="sm" onClick={() => { setTouched(false); setAlloc(autoAllocate(docs, amount)); }}>
                Oldest first
              </Button>
            }
          >
            {credit.data && (
              <p className="mb-3 text-[13px] text-muted-foreground">
                Outstanding <b className="text-foreground">{formatINR(credit.data.outstandingPaise)}</b>
                {credit.data.overdueInvoices > 0 && <span className="text-ios-red"> · {credit.data.overdueInvoices} overdue ({formatINR(credit.data.overduePaise)})</span>}
                {credit.data.tallyClosingPaise !== null && <> · Tally balance {formatINR(credit.data.tallyClosingPaise)}</>}
              </p>
            )}
            {open.isLoading ? (
              <LoadingRows rows={3} />
            ) : !docs.length ? (
              <EmptyState title="No open invoices" description="The full amount will be kept as an advance." className="py-6" />
            ) : (
              <AllocationGrid docs={docs} alloc={alloc} amountPaise={amount} onChange={(a) => { setTouched(true); setAlloc(a); }} />
            )}
            {errors.alloc && <p className="mt-2 text-[12px] text-destructive">{errors.alloc}</p>}
          </Section>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save receipt"} <kbd className="ml-1 hidden text-[10px] opacity-70 sm:inline">Ctrl S</kbd>
          </Button>
        </div>
      </form>
    </>
  );
}

export default function NewReceiptPage() {
  return (
    <Suspense>
      <NewReceipt />
    </Suspense>
  );
}
