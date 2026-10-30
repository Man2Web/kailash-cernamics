"use client";

import { useEffect } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { orgCompanySchema } from "@gc/shared";
import type { z } from "zod";
import { Section } from "@/components/common/page-header";
import { FormGrid, TextField, TextareaField } from "@/components/common/form-fields";
import { Button } from "@/components/ui/button";
import { api, ApiError, useApi, useApiMutation } from "@/lib/api";
import { useSession } from "@/lib/session";

type Company = z.infer<typeof orgCompanySchema> & { id: string };

export function CompanyCard() {
  const { can } = useSession();
  const q = useApi<Company>("/company");
  const form = useForm<Company>({ resolver: zodResolver(orgCompanySchema) as unknown as Resolver<Company> });
  useEffect(() => {
    if (q.data) form.reset(q.data);
  }, [q.data, form]);
  const save = useApiMutation((body: Company) => api("/company", { method: "PATCH", body }), ["/company"]);
  const submit = form.handleSubmit((v) => {
    const { id: _id, ...body } = v as Company & Record<string, unknown>;
    const allowed = ["name", "legalName", "gstin", "pan", "address", "phone", "email", "logoUrl"];
    const clean = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
    save.mutate(clean as Company, {
      onSuccess: () => toast.success("Company saved"),
      onError: (e: ApiError) => {
        e.issues?.forEach((i) => form.setError(i.path as never, { message: i.message }));
        toast.error(e.message);
      },
    });
  });
  if (!q.data) return null;
  return (
    <Section title="Company">
      <form onSubmit={submit}>
        <fieldset disabled={!can("org.write")}>
          <FormGrid cols={3}>
            <TextField control={form.control} name="name" label="Trade name" required />
            <TextField control={form.control} name="legalName" label="Legal name" />
            <TextField control={form.control} name="gstin" label="GSTIN" maxLength={15} />
            <TextField control={form.control} name="pan" label="PAN" maxLength={10} />
            <TextField control={form.control} name="phone" label="Phone" />
            <TextField control={form.control} name="email" label="Email" type="email" />
          </FormGrid>
          <TextareaField control={form.control} name="address" label="Address" rows={2} className="mt-4" />
          {can("org.write") && (
            <div className="mt-4 flex justify-end">
              <Button type="submit" disabled={save.isPending}>
                Save company
              </Button>
            </div>
          )}
        </fieldset>
      </form>
    </Section>
  );
}
