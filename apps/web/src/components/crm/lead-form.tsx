"use client";

import { useForm, Controller, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { CRM_LEAD_SOURCES, crmLeadSchema, labelOf, LEAD_STATUSES, type CrmLeadInput } from "@gc/shared";
import { FieldShell, FormGrid, SelectField, TextareaField, TextField } from "@/components/common/form-fields";
import { EntitySelect } from "@/components/common/entity-select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { api, ApiError, newIdempotencyKey } from "@/lib/api";
import { useFormKeys } from "@/hooks/use-form-keys";
import { useState } from "react";

export interface Lead extends Omit<CrmLeadInput, "nextFollowupAt"> {
  id: string;
  nextFollowupAt: string | null;
}

function toLocalInput(v: string | Date | null | undefined) {
  if (!v) return "";
  const d = new Date(v);
  const ist = new Date(d.getTime() + 330 * 60_000);
  return ist.toISOString().slice(0, 16);
}

export function LeadForm({ lead, onSaved, onCancel }: { lead?: Lead; onSaved: (id: string) => void; onCancel?: () => void }) {
  const [key] = useState(newIdempotencyKey);
  const form = useForm<CrmLeadInput>({
    resolver: zodResolver(crmLeadSchema) as Resolver<CrmLeadInput>,
    defaultValues: lead
      ? { ...lead, nextFollowupAt: lead.nextFollowupAt ? new Date(lead.nextFollowupAt) : null }
      : { name: "", phone: "", email: "", source: "WALK_IN", status: "NEW", requirement: "", siteAddress: "", nextFollowupAt: null, assignedToId: null },
  });
  const submit = form.handleSubmit(async (values) => {
    try {
      const body = { ...values, nextFollowupAt: values.nextFollowupAt ? new Date(values.nextFollowupAt).toISOString() : null };
      const res = lead ? await api<{ id: string }>(`/leads/${lead.id}`, { method: "PATCH", body }) : await api<{ id: string }>("/leads", { method: "POST", body, idempotencyKey: key });
      toast.success("Lead saved");
      onSaved(res.id);
    } catch (e) {
      if (e instanceof ApiError) e.issues?.forEach((i) => form.setError(i.path as never, { message: i.message }));
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  });
  const ref = useFormKeys<HTMLFormElement>(() => submit());
  const status = form.watch("status");

  return (
    <form ref={ref} onSubmit={submit} className="space-y-4">
      <FormGrid>
        <TextField control={form.control} name="name" label="Name" required autoFocus />
        <TextField control={form.control} name="phone" label="Phone" type="tel" />
        <SelectField control={form.control} name="source" label="Source" allowEmpty={false} options={CRM_LEAD_SOURCES.map((s) => ({ value: s, label: labelOf(s) }))} />
        <SelectField control={form.control} name="status" label="Status" allowEmpty={false} options={LEAD_STATUSES.map((s) => ({ value: s, label: labelOf(s) }))} />
        <Controller
          control={form.control}
          name="assignedToId"
          render={({ field }) => (
            <FieldShell label="Assigned to">
              <EntitySelect<{ id: string; name: string }> endpoint="/crm/users" value={field.value} onChange={(id) => field.onChange(id)} getLabel={(u) => u.name} clearable placeholder="Me" />
            </FieldShell>
          )}
        />
        <Controller
          control={form.control}
          name="nextFollowupAt"
          render={({ field, fieldState }) => (
            <FieldShell label="Next follow-up" error={fieldState.error?.message}>
              <Input type="datetime-local" value={toLocalInput(field.value as Date | null)} onChange={(e) => field.onChange(e.target.value ? new Date(`${e.target.value}:00+05:30`) : null)} />
            </FieldShell>
          )}
        />
        <Controller
          control={form.control}
          name="partyId"
          render={({ field }) => (
            <FieldShell label="Existing customer (optional)">
              <EntitySelect<{ id: string; name: string; phone?: string }> endpoint="/parties" params={{ type: "CUSTOMER" }} value={field.value} onChange={(id) => field.onChange(id)} getLabel={(p) => p.name} getDescription={(p) => p.phone} clearable />
            </FieldShell>
          )}
        />
        <Controller
          control={form.control}
          name="influencerId"
          render={({ field }) => (
            <FieldShell label="Architect / influencer (optional)">
              <EntitySelect<{ id: string; name: string; type?: string }> endpoint="/influencers" value={field.value} onChange={(id) => field.onChange(id)} getLabel={(p) => p.name} getDescription={(p) => labelOf(p.type)} clearable />
            </FieldShell>
          )}
        />
        <TextareaField control={form.control} name="requirement" label="Requirement" placeholder="Rooms, sizes, finish, budget…" className="md:col-span-2" />
        <TextField control={form.control} name="siteAddress" label="Site address" className="md:col-span-2" />
        {status === "LOST" && <TextField control={form.control} name="lostReason" label="Why was it lost?" className="md:col-span-2" />}
      </FormGrid>
      <div className="flex justify-end gap-2">
        {onCancel && <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? "Saving…" : "Save lead"}</Button>
      </div>
    </form>
  );
}
