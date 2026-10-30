"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader, Section } from "@/components/common/page-header";
import { FieldShell, FormGrid, NativeSelect } from "@/components/common/form-fields";
import { ErrorState, LoadingPage } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, useApi, useApiMutation } from "@/lib/api";
import { useSession } from "@/lib/session";
import { CompanyCard } from "@/components/masters/company-card";

type Settings = Record<string, unknown>;

const NUMBERS: { key: string; label: string; suffix: string; hint?: string }[] = [
  { key: "wastage.floor", label: "Floor wastage", suffix: "%" },
  { key: "wastage.wall", label: "Wall wastage", suffix: "%" },
  { key: "wastage.skirting", label: "Skirting wastage", suffix: "%" },
  { key: "wastage.highlighter", label: "Highlighter wastage", suffix: "%" },
  { key: "quotation.validityDays", label: "Quotation validity", suffix: "days" },
  { key: "charges.gstRate", label: "GST on transport/loading", suffix: "%" },
  { key: "stock.deadStockDays", label: "Dead stock after", suffix: "days", hint: "No sale or movement for this long" },
  { key: "tally.heartbeatAlertMinutes", label: "Tally agent silent alert", suffix: "min" },
];

export default function GeneralSettingsPage() {
  const { can } = useSession();
  const q = useApi<Settings>("/settings");
  const [vals, setVals] = useState<Settings>({});
  useEffect(() => {
    if (q.data) setVals(q.data);
  }, [q.data]);
  const save = useApiMutation((body: Settings) => api("/settings", { method: "PUT", body }), ["/settings"]);

  if (q.isLoading) return <LoadingPage />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const canWrite = can("org.write");

  return (
    <>
      <PageHeader title="General settings" description="Company details and defaults used across quotations, GRNs and reports." />
      <div className="space-y-4">
        <CompanyCard />
        <Section title="Defaults">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(vals, { onSuccess: () => toast.success("Settings saved"), onError: (err) => toast.error(err.message) });
            }}
          >
            <fieldset disabled={!canWrite}>
              <FormGrid cols={4}>
                {NUMBERS.map((n) => (
                  <FieldShell key={n.key} label={n.label} hint={n.hint} htmlFor={n.key}>
                    <div className="relative">
                      <Input
                        id={n.key}
                        type="number"
                        inputMode="decimal"
                        className="pr-12 tabular"
                        value={String(vals[n.key] ?? "")}
                        onChange={(e) => setVals((v) => ({ ...v, [n.key]: e.target.value === "" ? null : Number(e.target.value) }))}
                      />
                      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[12px] text-muted-foreground">{n.suffix}</span>
                    </div>
                  </FieldShell>
                ))}
                <FieldShell label="GRN landed cost split" htmlFor="alloc" hint="How freight/unloading is spread over GRN lines">
                  <NativeSelect id="alloc" value={String(vals["grn.allocationBasis"] ?? "VALUE")} onChange={(e) => setVals((v) => ({ ...v, "grn.allocationBasis": e.target.value }))}>
                    <option value="VALUE">By value</option>
                    <option value="WEIGHT">By weight</option>
                  </NativeSelect>
                </FieldShell>
              </FormGrid>
              {canWrite && (
                <div className="mt-4 flex justify-end">
                  <Button type="submit" disabled={save.isPending}>
                    {save.isPending ? "Saving…" : "Save settings"}
                  </Button>
                </div>
              )}
            </fieldset>
          </form>
        </Section>
      </div>
    </>
  );
}
