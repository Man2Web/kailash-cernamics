"use client";

import { Controller, type Control, type FieldValues, type Path } from "react-hook-form";
import { EntitySelect } from "@/components/common/entity-select";
import { FieldShell } from "@/components/common/form-fields";
import type { Query } from "@/lib/api";

/** RHF-bound EntitySelect (searchable picker over a list endpoint). */
export function EntityField<T extends FieldValues, I extends { id: string } = any>(p: {
  control: Control<T>;
  name: Path<T>;
  label: string;
  endpoint: string;
  getLabel: (item: I) => string;
  getDescription?: (item: I) => React.ReactNode;
  params?: Query;
  required?: boolean;
  className?: string;
  placeholder?: string;
  onPicked?: (item: I | null) => void;
  /** Turns the field into a text box with suggestions; typed values that don't exist are saved as new. */
  buildNew?: (typed: string) => Record<string, unknown> | null;
  invalidMessage?: string;
}) {
  return (
    <Controller
      control={p.control}
      name={p.name}
      render={({ field, fieldState }) => (
        <FieldShell label={p.label} error={fieldState.error?.message} required={p.required} className={p.className}>
          <EntitySelect<I>
            endpoint={p.endpoint}
            value={field.value}
            params={p.params}
            placeholder={p.placeholder}
            onChange={(id, item) => {
              field.onChange(id);
              p.onPicked?.(item);
            }}
            getLabel={p.getLabel}
            getDescription={p.getDescription}
            clearable={!p.required}
            buildNew={p.buildNew}
            invalidMessage={p.invalidMessage}
          />
        </FieldShell>
      )}
    />
  );
}
