"use client";

import * as React from "react";
import { Controller, type Control, type FieldValues, type Path } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { formatIndian, rupeesToPaise } from "@gc/shared";

export function FieldShell({ label, error, hint, htmlFor, className, children, required }: {
  label?: React.ReactNode;
  error?: string;
  hint?: React.ReactNode;
  htmlFor?: string;
  className?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      {label && (
        <Label htmlFor={htmlFor} className="text-[13px] font-medium text-foreground/80">
          {label}
          {required && <span className="text-ios-red"> *</span>}
        </Label>
      )}
      {children}
      {error ? <p className="text-[12px] text-destructive">{error}</p> : hint ? <p className="text-[12px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

interface BaseProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label?: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export function TextField<T extends FieldValues>(p: BaseProps<T> & { type?: string; autoFocus?: boolean; maxLength?: number }) {
  return (
    <Controller
      control={p.control}
      name={p.name}
      render={({ field, fieldState }) => (
        <FieldShell label={p.label} error={fieldState.error?.message} hint={p.hint} htmlFor={p.name} className={p.className} required={p.required}>
          <Input
            id={p.name}
            type={p.type ?? "text"}
            autoFocus={p.autoFocus}
            placeholder={p.placeholder}
            disabled={p.disabled}
            maxLength={p.maxLength}
            aria-invalid={!!fieldState.error}
            {...field}
            value={field.value ?? ""}
          />
        </FieldShell>
      )}
    />
  );
}

export function NumberField<T extends FieldValues>(p: BaseProps<T> & { step?: string; min?: number; integer?: boolean; suffix?: string }) {
  return (
    <Controller
      control={p.control}
      name={p.name}
      render={({ field, fieldState }) => (
        <FieldShell label={p.label} error={fieldState.error?.message} hint={p.hint} htmlFor={p.name} className={p.className} required={p.required}>
          <div className="relative">
            <Input
              id={p.name}
              type="number"
              inputMode={p.integer ? "numeric" : "decimal"}
              step={p.step ?? (p.integer ? "1" : "any")}
              min={p.min}
              placeholder={p.placeholder}
              disabled={p.disabled}
              aria-invalid={!!fieldState.error}
              className={cn("tabular", p.suffix && "pr-14")}
              value={field.value ?? ""}
              onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
              onBlur={field.onBlur}
              ref={field.ref}
            />
            {p.suffix && <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[12px] text-muted-foreground">{p.suffix}</span>}
          </div>
        </FieldShell>
      )}
    />
  );
}

/** Rupee input stored as integer paise. */
export function MoneyField<T extends FieldValues>(p: BaseProps<T>) {
  return (
    <Controller
      control={p.control}
      name={p.name}
      render={({ field, fieldState }) => (
        <FieldShell label={p.label} error={fieldState.error?.message} hint={p.hint} htmlFor={p.name} className={p.className} required={p.required}>
          <MoneyInput id={p.name} value={field.value} onChange={field.onChange} disabled={p.disabled} invalid={!!fieldState.error} />
        </FieldShell>
      )}
    />
  );
}

export function MoneyInput({ value, onChange, id, disabled, invalid, className }: { value: number | null | undefined; onChange: (paise: number) => void; id?: string; disabled?: boolean; invalid?: boolean; className?: string }) {
  const display = value === null || value === undefined ? "" : (Number(value) / 100).toString();
  return (
    <div className={cn("relative", className)}>
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[13px] text-muted-foreground">₹</span>
      <Input
        id={id}
        inputMode="decimal"
        disabled={disabled}
        aria-invalid={invalid}
        className="pl-7 tabular"
        defaultValue={display}
        key={display}
        onBlur={(e) => {
          try {
            onChange(rupeesToPaise(e.target.value));
          } catch {
            onChange(0);
          }
        }}
        placeholder="0.00"
        title={value ? `₹${formatIndian(Number(value) / 100)}` : undefined}
      />
    </div>
  );
}

export function SelectField<T extends FieldValues>(p: BaseProps<T> & { options: { value: string; label: string }[]; allowEmpty?: boolean | string }) {
  return (
    <Controller
      control={p.control}
      name={p.name}
      render={({ field, fieldState }) => (
        <FieldShell label={p.label} error={fieldState.error?.message} hint={p.hint} htmlFor={p.name} className={p.className} required={p.required}>
          <NativeSelect
            id={p.name}
            value={field.value ?? ""}
            onChange={(e) => field.onChange(e.target.value === "" ? null : e.target.value)}
            onBlur={field.onBlur}
            disabled={p.disabled}
            aria-invalid={!!fieldState.error}
          >
            {p.allowEmpty !== false && <option value="">{typeof p.allowEmpty === "string" ? p.allowEmpty : "— Select —"}</option>}
            {p.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        </FieldShell>
      )}
    />
  );
}

/** Collects <option> elements (also inside fragments / arrays / conditionals) from children. */
function collectOptions(children: React.ReactNode, out: { value: string; label: string; disabled: boolean }[] = []) {
  React.Children.forEach(children, (c) => {
    if (!React.isValidElement(c)) return;
    const el = c as React.ReactElement<any>;
    if (el.type === "option") {
      const label = React.Children.toArray(el.props.children).join("");
      out.push({ value: String(el.props.value ?? label), label, disabled: !!el.props.disabled });
    } else if (el.props?.children) collectOptions(el.props.children, out);
  });
  return out;
}

/**
 * Drop-in replacement for <select>: a text box that suggests matching options as you type.
 * Same props (value, onChange(e.target.value), <option> children).
 */
export function NativeSelect({ className, wrapperClassName, children, value, onChange, onBlur, disabled, id, name, title, required, ...rest }: React.ComponentProps<"select"> & { wrapperClassName?: string }) {
  const options = collectOptions(children);
  const current = String(value ?? "");
  const emptyOpt = options.find((o) => o.value === "");
  const currentOpt = options.find((o) => o.value === current);
  const shown = current === "" ? "" : (currentOpt?.label ?? current);
  const [text, setText] = React.useState(shown);
  const [dirty, setDirty] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [hi, setHi] = React.useState(-1);
  React.useEffect(() => {
    if (!dirty) setText(shown);
  }, [shown, dirty]);

  const real = options.filter((o) => o.value !== "" && !o.disabled);
  const q = dirty ? text.trim().toLowerCase() : "";
  const items = q ? real.filter((o) => o.label.toLowerCase().includes(q)) : real;

  const fire = (v: string) => onChange?.({ target: { value: v, name, id }, currentTarget: { value: v, name, id } } as unknown as React.ChangeEvent<HTMLSelectElement>);
  const pick = (o: { value: string; label: string }) => {
    setDirty(false);
    setText(o.label);
    setOpen(false);
    setHi(-1);
    if (o.value !== current) fire(o.value);
  };
  const commit = () => {
    setOpen(false);
    setHi(-1);
    if (!dirty) return;
    const t = text.trim().toLowerCase();
    setDirty(false);
    if (!t) {
      if (emptyOpt && current !== "") fire("");
      else setText(shown);
      return;
    }
    const exact = real.find((o) => o.label.trim().toLowerCase() === t);
    if (exact) pick(exact);
    else if (items.length === 1) pick(items[0]!);
    else setText(shown);
  };

  return (
    <div className={cn("relative min-w-0", wrapperClassName ?? "w-full")}>
      <input
        id={id}
        name={name}
        title={title}
        required={required}
        role="combobox"
        aria-expanded={open}
        aria-invalid={rest["aria-invalid"]}
        aria-label={rest["aria-label"]}
        autoComplete="off"
        disabled={disabled}
        value={text}
        placeholder={emptyOpt?.label ?? "Type to search…"}
        className={cn(
          "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 text-[14px] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 aria-invalid:border-destructive",
          className,
        )}
        onChange={(e) => {
          setText(e.target.value);
          setDirty(true);
          setOpen(true);
          setHi(-1);
        }}
        onFocus={(e) => {
          setOpen(true);
          e.currentTarget.select();
        }}
        onBlur={(e) => {
          commit();
          onBlur?.(e as unknown as React.FocusEvent<HTMLSelectElement>);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setHi((h) => Math.min(h + 1, items.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHi((h) => Math.max(h - 1, 0));
          } else if (e.key === "Escape") {
            setOpen(false);
            setDirty(false);
            setText(shown);
          } else if (e.key === "Enter" && open) {
            if (hi >= 0 && items[hi]) {
              e.preventDefault();
              pick(items[hi]!);
            } else if (dirty) {
              e.preventDefault();
              commit();
            }
          }
        }}
      />
      {open && (
        <ul className="absolute z-50 mt-1 max-h-56 w-full min-w-40 overflow-auto rounded-md border bg-popover p-1 text-sm shadow-md">
          {items.length === 0 && <li className="px-2 py-1.5 text-xs text-muted-foreground">No matches</li>}
          {items.map((o, i) => (
            <li
              key={o.value}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
              onMouseEnter={() => setHi(i)}
              className={cn("cursor-pointer truncate rounded-sm px-2 py-1.5", (i === hi || o.value === current) && "bg-accent text-accent-foreground")}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TextareaField<T extends FieldValues>(p: BaseProps<T> & { rows?: number }) {
  return (
    <Controller
      control={p.control}
      name={p.name}
      render={({ field, fieldState }) => (
        <FieldShell label={p.label} error={fieldState.error?.message} hint={p.hint} htmlFor={p.name} className={p.className} required={p.required}>
          <Textarea id={p.name} rows={p.rows ?? 3} placeholder={p.placeholder} disabled={p.disabled} {...field} value={field.value ?? ""} />
        </FieldShell>
      )}
    />
  );
}

export function SwitchField<T extends FieldValues>(p: BaseProps<T>) {
  return (
    <Controller
      control={p.control}
      name={p.name}
      render={({ field }) => (
        <label className={cn("flex items-center justify-between gap-3 rounded-md bg-fill px-3 py-2 text-[13.5px]", p.className)}>
          <span>{p.label}</span>
          <Switch checked={!!field.value} onCheckedChange={field.onChange} disabled={p.disabled} />
        </label>
      )}
    />
  );
}

export function DateField<T extends FieldValues>(p: BaseProps<T>) {
  return (
    <Controller
      control={p.control}
      name={p.name}
      render={({ field, fieldState }) => (
        <FieldShell label={p.label} error={fieldState.error?.message} hint={p.hint} htmlFor={p.name} className={p.className} required={p.required}>
          <Input id={p.name} type="date" disabled={p.disabled} {...field} value={field.value ? String(field.value).slice(0, 10) : ""} />
        </FieldShell>
      )}
    />
  );
}

/** Two columns on desktop, one on mobile. */
export function FormGrid({ children, className, cols = 2 }: { children: React.ReactNode; className?: string; cols?: 2 | 3 | 4 }) {
  return (
    <div className={cn("grid grid-cols-1 gap-4", cols === 2 && "md:grid-cols-2", cols === 3 && "md:grid-cols-3", cols === 4 && "md:grid-cols-4", className)}>
      {children}
    </div>
  );
}
