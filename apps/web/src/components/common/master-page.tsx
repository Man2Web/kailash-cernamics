"use client";

import { useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ZodType } from "zod";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api, ApiError, useApiMutation, type Query } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { PermissionCode } from "@gc/shared";
import { DataTable, type DataColumn, type FilterDef } from "./data-table";
import { FormGrid, NumberField, SelectField, SwitchField, TextField, TextareaField } from "./form-fields";
import { EntitySelect } from "./entity-select";
import { Controller } from "react-hook-form";
import { FieldShell } from "./form-fields";
import { useFormKeys } from "@/hooks/use-form-keys";

export type MasterField =
  | { name: string; label: string; type: "text" | "email" | "tel"; required?: boolean; placeholder?: string }
  | { name: string; label: string; type: "number"; integer?: boolean; required?: boolean; suffix?: string }
  | { name: string; label: string; type: "textarea" }
  | { name: string; label: string; type: "switch" }
  | { name: string; label: string; type: "select"; options: { value: string; label: string }[]; required?: boolean }
  | { name: string; label: string; type: "entity"; endpoint: string; getLabel: (x: any) => string; required?: boolean; params?: Query };

export interface MasterConfig<T extends { id: string }> {
  title: string;
  singular: string;
  endpoint: string;
  columns: DataColumn<T>[];
  fields: MasterField[];
  schema: ZodType<any>;
  defaults: Record<string, unknown>;
  writePerm: PermissionCode;
  filters?: FilterDef[];
  /** map a row to form values for editing */
  toForm?: (row: T) => Record<string, unknown>;
}

/** Generic list + create/edit dialog for simple masters (brands, sizes, colours, vehicles…). */
export function MasterPage<T extends { id: string }>({ config, toolbarExtra }: { config: MasterConfig<T>; toolbarExtra?: React.ReactNode }) {
  const { can } = useSession();
  const [editing, setEditing] = useState<T | "new" | null>(null);
  const canWrite = can(config.writePerm);
  const del = useApiMutation((id: string) => api(`${config.endpoint}/${id}`, { method: "DELETE" }), [config.endpoint]);

  return (
    <>
      <DataTable<T>
        endpoint={config.endpoint}
        columns={config.columns}
        filters={config.filters}
        exportName={config.title}
        searchPlaceholder={`Search ${config.title.toLowerCase()}…`}
        onRowClick={canWrite ? (row) => setEditing(row) : undefined}
        toolbar={
          <>
            {toolbarExtra}
            {canWrite && (
              <Button size="sm" className="h-9" onClick={() => setEditing("new")}>
                <Plus className="size-4" /> New {config.singular.toLowerCase()}
              </Button>
            )}
          </>
        }
        rowActions={
          canWrite
            ? [
                { label: "Edit", onSelect: (r) => setEditing(r) },
                {
                  label: "Delete",
                  destructive: true,
                  onSelect: (r) => {
                    if (!confirm(`Delete this ${config.singular.toLowerCase()}?`)) return;
                    del.mutate(r.id, { onSuccess: () => toast.success("Deleted"), onError: (e) => toast.error(e.message) });
                  },
                },
              ]
            : undefined
        }
      />
      {editing && <MasterDialog config={config} row={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function MasterDialog<T extends { id: string }>({ config, row, onClose }: { config: MasterConfig<T>; row: T | null; onClose: () => void }) {
  const initial = row ? (config.toForm ? config.toForm(row) : pick(row as Record<string, unknown>, config.fields.map((f) => f.name))) : config.defaults;
  const form = useForm({ resolver: zodResolver(config.schema as never) as Resolver<any>, defaultValues: initial });
  const save = useApiMutation(
    (values: Record<string, unknown>) => (row ? api(`${config.endpoint}/${row.id}`, { method: "PATCH", body: values }) : api(config.endpoint, { method: "POST", body: values })),
    [config.endpoint],
  );
  const submit = form.handleSubmit((values) =>
    save.mutate(values, {
      onSuccess: () => {
        toast.success(`${config.singular} saved`);
        onClose();
      },
      onError: (e: ApiError) => {
        e.issues?.forEach((i) => form.setError(i.path as never, { message: i.message }));
        toast.error(e.message);
      },
    }),
  );
  const ref = useFormKeys<HTMLFormElement>(() => submit());

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{row ? `Edit ${config.singular.toLowerCase()}` : `New ${config.singular.toLowerCase()}`}</DialogTitle>
        </DialogHeader>
        <form ref={ref} onSubmit={submit} className="space-y-4">
          <FormGrid>
            {config.fields.map((f, i) => {
              const common = { control: form.control, name: f.name as never, label: f.label };
              switch (f.type) {
                case "number":
                  return <NumberField key={f.name} {...common} integer={f.integer} required={f.required} suffix={f.suffix} />;
                case "textarea":
                  return <TextareaField key={f.name} {...common} className="md:col-span-2" />;
                case "switch":
                  return <SwitchField key={f.name} {...common} />;
                case "select":
                  return <SelectField key={f.name} {...common} options={f.options} required={f.required} />;
                case "entity":
                  return (
                    <Controller
                      key={f.name}
                      control={form.control}
                      name={f.name as never}
                      render={({ field, fieldState }) => (
                        <FieldShell label={f.label} error={fieldState.error?.message} required={f.required}>
                          <EntitySelect endpoint={f.endpoint} params={f.params} value={field.value} onChange={(id) => field.onChange(id)} getLabel={f.getLabel} clearable />
                        </FieldShell>
                      )}
                    />
                  );
                default:
                  return <TextField key={f.name} {...common} type={f.type} required={f.required} placeholder={f.placeholder} autoFocus={i === 0} />;
              }
            })}
          </FormGrid>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function pick(o: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, o[k] ?? null]));
}
