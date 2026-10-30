"use client";

import { use, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatDate, formatINR, labelOf, PARTY_TYPES, partiesPartySchema, SEGMENTS, STATES, stateCodeFromGstin, validateGstin, type PartyInput } from "@gc/shared";
import { InfoGrid, PageHeader, Section } from "@/components/common/page-header";
import { FormGrid, MoneyField, NumberField, SelectField, SwitchField, TextField, TextareaField } from "@/components/common/form-fields";
import { ErrorState, LoadingPage } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError, useApi, useApiMutation } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useFormKeys, useUnsavedGuard } from "@/hooks/use-form-keys";

interface Site {
  id: string;
  name: string;
  address: string | null;
  contactName: string | null;
  contactPhone: string | null;
}
interface Party extends PartyInput {
  id: string;
  sites: Site[];
}
interface Credit {
  outstandingPaise: number;
  overduePaise: number;
  overdueInvoices: number;
  creditLimitPaise: number;
  creditDays: number;
  tallyClosingPaise: number | null;
  tallyAsOf: string | null;
  ok: boolean;
  reasons: string[];
}

const EMPTY: PartyInput = {
  type: "CUSTOMER",
  segment: "RETAIL",
  name: "",
  phone: "",
  email: "",
  gstin: "",
  stateCode: "33",
  billingAddress: "",
  shippingAddress: "",
  city: "Coimbatore",
  creditLimitPaise: 0,
  creditDays: 0,
  openingBalancePaise: 0,
  tallyLedgerName: "",
  notes: "",
  isActive: true,
};

function toForm(p: Party): PartyInput {
  const out = { ...EMPTY } as Record<string, unknown>;
  for (const k of Object.keys(EMPTY)) out[k] = (p as unknown as Record<string, unknown>)[k] ?? (EMPTY as unknown as Record<string, unknown>)[k];
  return out as PartyInput;
}

function PartyForm({ party, defaultType }: { party?: Party; defaultType?: string }) {
  const router = useRouter();
  const { can } = useSession();
  const canWrite = can("party.write");
  const form = useForm<PartyInput>({
    resolver: zodResolver(partiesPartySchema) as Resolver<PartyInput>,
    defaultValues: party ? toForm(party) : { ...EMPTY, type: (defaultType as PartyInput["type"]) ?? "CUSTOMER", segment: defaultType === "SUPPLIER" ? "DEALER" : "RETAIL" },
  });
  const v = useWatch({ control: form.control });
  useUnsavedGuard(form.formState.isDirty);
  const save = useApiMutation(
    (body: PartyInput) => (party ? api<Party>(`/parties/${party.id}`, { method: "PATCH", body }) : api<Party>("/parties", { method: "POST", body })),
    ["/parties"],
  );
  const submit = form.handleSubmit((body) =>
    save.mutate(body, {
      onSuccess: (row) => {
        toast.success("Saved");
        form.reset(toForm(row as Party));
        if (!party) router.replace(`/parties/${(row as Party).id}`);
      },
      onError: (e: ApiError) => {
        e.issues?.forEach((i) => form.setError(i.path as never, { message: i.message }));
        toast.error(e.message);
      },
    }),
  );
  const ref = useFormKeys<HTMLFormElement>(() => submit());
  const gstHint = v.gstin ? (validateGstin(v.gstin).valid ? `Valid GSTIN · state ${stateCodeFromGstin(v.gstin)}` : validateGstin(v.gstin).error) : "Optional for retail customers";

  return (
    <form ref={ref} onSubmit={submit} className="space-y-4">
      <fieldset disabled={!canWrite} className="space-y-4">
        <Section title="Details">
          <FormGrid>
            <TextField control={form.control} name="name" label="Name" required autoFocus={!party} />
            <SelectField control={form.control} name="type" label="Type" allowEmpty={false} options={PARTY_TYPES.map((t) => ({ value: t, label: t === "BOTH" ? "Customer & supplier" : labelOf(t) }))} />
            <SelectField control={form.control} name="segment" label="Segment (price list)" allowEmpty={false} options={SEGMENTS.filter((s) => s !== "CLEARANCE").map((s) => ({ value: s, label: labelOf(s) }))} />
            <TextField control={form.control} name="phone" label="Phone" type="tel" />
            <TextField control={form.control} name="email" label="Email" type="email" />
            <TextField control={form.control} name="city" label="City" />
          </FormGrid>
        </Section>
        <Section title="GST and address">
          <FormGrid>
            <TextField control={form.control} name="gstin" label="GSTIN" hint={gstHint} maxLength={15} />
            <SelectField
              control={form.control}
              name="stateCode"
              label="State (place of supply)"
              allowEmpty={false}
              options={STATES.map((s) => ({ value: s.code, label: `${s.code} · ${s.name}` }))}
            />
            <TextareaField control={form.control} name="billingAddress" label="Billing address" rows={2} />
            <TextareaField control={form.control} name="shippingAddress" label="Shipping address" rows={2} />
          </FormGrid>
        </Section>
        <Section title="Credit">
          <FormGrid cols={3}>
            <MoneyField control={form.control} name="creditLimitPaise" label="Credit limit" hint="0 = no limit set" />
            <NumberField control={form.control} name="creditDays" label="Credit days" integer suffix="days" />
            <MoneyField control={form.control} name="openingBalancePaise" label="Opening balance" hint="Receivable (+) / payable (−) at go-live" />
            <TextField control={form.control} name="tallyLedgerName" label="Tally ledger name" />
            <SwitchField control={form.control} name="isActive" label="Active" className="self-end" />
          </FormGrid>
          <TextareaField control={form.control} name="notes" label="Notes" rows={2} className="mt-4" />
        </Section>
      </fieldset>
      {canWrite && (
        <div className="material-bar sticky bottom-0 -mx-3 flex justify-end gap-2 border-t border-border px-3 py-3 md:-mx-6 md:px-6">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      )}
    </form>
  );
}

function Sites({ party }: { party: Party }) {
  const { can } = useSession();
  const [d, setD] = useState({ name: "", address: "", contactName: "", contactPhone: "" });
  const add = useApiMutation(() => api(`/parties/${party.id}/sites`, { method: "POST", body: d }), [`/parties/${party.id}`]);
  const del = useApiMutation((id: string) => api(`/sites/${id}`, { method: "DELETE" }), [`/parties/${party.id}`]);
  return (
    <Section title="Sites" actions={<span className="text-[12px] text-muted-foreground">Site-wise orders and deliveries</span>}>
      {party.sites.length ? (
        <ul className="mb-3 divide-y divide-border">
          {party.sites.map((s) => (
            <li key={s.id} className="flex items-start gap-3 py-2 text-[13.5px]">
              <div className="flex-1">
                <div className="font-medium">{s.name}</div>
                <div className="text-[12px] text-muted-foreground">
                  {[s.address, s.contactName, s.contactPhone].filter(Boolean).join(" · ")}
                </div>
              </div>
              {can("party.write") && (
                <Button variant="ghost" size="icon" className="size-7" aria-label="Remove site" onClick={() => confirm("Remove this site?") && del.mutate(s.id)}>
                  <Trash2 className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-[13px] text-muted-foreground">No sites yet.</p>
      )}
      {can("party.write") && (
        <div className="grid gap-2 md:grid-cols-5">
          <Input placeholder="Site name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
          <Input placeholder="Address" value={d.address} onChange={(e) => setD({ ...d, address: e.target.value })} />
          <Input placeholder="Contact" value={d.contactName} onChange={(e) => setD({ ...d, contactName: e.target.value })} />
          <Input placeholder="Phone" value={d.contactPhone} onChange={(e) => setD({ ...d, contactPhone: e.target.value })} />
          <Button
            disabled={!d.name || add.isPending}
            onClick={() =>
              add.mutate(undefined, {
                onSuccess: () => {
                  setD({ name: "", address: "", contactName: "", contactPhone: "" });
                  toast.success("Site added");
                },
                onError: (e) => toast.error(e.message),
              })
            }
          >
            Add site
          </Button>
        </div>
      )}
    </Section>
  );
}

function CreditCard({ partyId }: { partyId: string }) {
  const q = useApi<Credit>(`/parties/${partyId}/credit`);
  if (!q.data) return null;
  const c = q.data;
  return (
    <Section title="Outstanding & credit" actions={!c.ok ? <span className="text-[12px] font-medium text-ios-red">{c.reasons.join(" · ")}</span> : undefined}>
      <InfoGrid
        items={[
          { label: "Outstanding", value: formatINR(c.outstandingPaise) },
          { label: "Overdue", value: c.overduePaise ? <span className="text-ios-red">{formatINR(c.overduePaise)} ({c.overdueInvoices})</span> : "—" },
          { label: "Credit limit", value: c.creditLimitPaise ? formatINR(c.creditLimitPaise) : "Not set" },
          { label: "Tally balance", value: c.tallyClosingPaise !== null ? `${formatINR(c.tallyClosingPaise)} (${formatDate(c.tallyAsOf)})` : "Not synced" },
        ]}
      />
    </Section>
  );
}

export default function PartyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const search = useSearchParams();
  const isNew = id === "new";
  const q = useApi<Party>(isNew ? null : `/parties/${id}`);
  const type = search.get("type") ?? "CUSTOMER";
  const back = (p?: { type: string }) => ((p?.type ?? type) === "SUPPLIER" ? { href: "/parties/suppliers", label: "Suppliers" } : { href: "/parties/customers", label: "Customers" });

  if (isNew) {
    return (
      <>
        <PageHeader title={type === "SUPPLIER" ? "New supplier" : "New customer"} back={back()} />
        <PartyForm defaultType={type} />
      </>
    );
  }
  if (q.isLoading) return <LoadingPage />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const p = q.data;
  return (
    <>
      <PageHeader title={p.name} description={`${p.type === "BOTH" ? "Customer & supplier" : labelOf(p.type)} · ${labelOf(p.segment)}${p.phone ? ` · ${p.phone}` : ""}`} back={back(p)} />
      <div className="space-y-4">
        {p.type !== "SUPPLIER" && <CreditCard partyId={p.id} />}
        <PartyForm key={JSON.stringify(p).length} party={p} />
        {p.type !== "SUPPLIER" && <Sites party={p} />}
      </div>
    </>
  );
}
