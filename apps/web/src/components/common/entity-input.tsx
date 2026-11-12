"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { apiGet, apiPost, type Query } from "@/lib/api";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

export interface EntityInputProps<T extends { id: string }> {
  /** master endpoint, e.g. "/brands" — supports ?q=&pageSize=, GET /:id and POST */
  endpoint: string;
  value: string | null | undefined;
  onChange: (id: string | null, item: T | null) => void;
  getLabel: (item: T) => string;
  params?: Query;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  autoFocus?: boolean;
  /** Request body for a brand-new value typed by the user, or null when the text is not acceptable. */
  buildNew?: (typed: string) => Record<string, unknown> | null;
  /** Message shown when the typed text can't be used. */
  invalidMessage?: string;
  getDescription?: (item: T) => React.ReactNode;
  /** Emptying the box clears the value (otherwise it reverts). */
  clearable?: boolean;
}

/**
 * Plain text box with suggestions. Typing filters existing values; pressing Enter or leaving the field
 * picks an exact match, or saves what was typed as a new master record (needs catalogue.write).
 */
export function EntityInput<T extends { id: string }>(p: EntityInputProps<T>) {
  const { can } = useSession();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [dirty, setDirty] = useState(false);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const [dq, setDq] = useState("");
  const busy = useRef(false);

  const selected = useQuery({
    queryKey: [p.endpoint, "one", p.value],
    queryFn: () => apiGet<T>(`${p.endpoint}/${p.value}`),
    enabled: !!p.value,
    staleTime: 60_000,
  });
  const selectedLabel = p.value ? (selected.data ? p.getLabel(selected.data) : "") : "";
  // show the chosen value unless the user is in the middle of typing
  useEffect(() => {
    if (!dirty) setText(selectedLabel);
  }, [selectedLabel, dirty]);

  useEffect(() => {
    const t = setTimeout(() => setDq(text.trim()), 200);
    return () => clearTimeout(t);
  }, [text]);

  const list = useQuery({
    queryKey: [p.endpoint, "suggest", dirty ? dq : "", p.params ?? {}],
    queryFn: () => apiGet<{ items: T[] }>(p.endpoint, { ...p.params, q: dirty ? dq : "", pageSize: 20 }),
    enabled: open,
  });
  const items = list.data?.items ?? [];

  function pick(item: T) {
    setDirty(false);
    setText(p.getLabel(item));
    setOpen(false);
    setHi(-1);
    p.onChange(item.id, item);
  }

  async function commit() {
    const typed = text.trim();
    setOpen(false);
    setHi(-1);
    if (!dirty || busy.current) return;
    if (!typed) {
      setDirty(false);
      if (p.clearable) p.onChange(null, null);
      else setText(selectedLabel);
      return;
    }
    if (typed.toLowerCase() === selectedLabel.trim().toLowerCase() && selected.data) {
      setDirty(false);
      return;
    }
    busy.current = true;
    try {
      const found = await apiGet<{ items: T[] }>(p.endpoint, { ...p.params, q: typed, pageSize: 20 });
      const exact = found.items.find((i) => p.getLabel(i).trim().toLowerCase() === typed.toLowerCase());
      if (exact) return pick(exact);
      const body = p.buildNew && can("catalogue.write") ? p.buildNew(typed) : null;
      if (!body) {
        toast.error(!p.buildNew ? (p.invalidMessage ?? "Pick a value from the list") : can("catalogue.write") ? (p.invalidMessage ?? "That value can't be added here") : "You don't have permission to add new values");
        setDirty(false);
        setText(selectedLabel);
        return;
      }
      const row = await apiPost<T>(p.endpoint, body);
      await qc.invalidateQueries({ queryKey: [p.endpoint] });
      toast.success(`Added "${typed}"`);
      pick(row);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
      setDirty(false);
      setText(selectedLabel);
    } finally {
      busy.current = false;
    }
  }

  return (
    <div className="relative">
      <Input
        id={p.id}
        value={text}
        disabled={p.disabled}
        autoFocus={p.autoFocus}
        autoComplete="off"
        placeholder={p.placeholder ?? (p.buildNew ? "Type to search or add…" : "Type to search…")}
        className={cn("h-9", p.className)}
        role="combobox"
        aria-expanded={open}
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
        onBlur={() => void commit()}
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
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (open && hi >= 0 && items[hi]) pick(items[hi]);
            else void commit();
          }
        }}
      />
      {open && items.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover p-1 text-sm shadow-md">
          {items.map((it, i) => (
            <li
              key={it.id}
              // mousedown (not click) so it runs before the input's blur
              onMouseDown={(e) => {
                e.preventDefault();
                pick(it);
              }}
              onMouseEnter={() => setHi(i)}
              className={cn("cursor-pointer truncate rounded-sm px-2 py-1.5", i === hi && "bg-accent text-accent-foreground")}
            >
              <div className="truncate">{p.getLabel(it)}</div>
              {p.getDescription && <div className="truncate text-[12px] text-muted-foreground">{p.getDescription(it)}</div>}
            </li>
          ))}
        </ul>
      )}
      {open && dirty && text.trim() && !list.isFetching && items.length === 0 && !p.buildNew && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover px-2 py-1.5 text-xs text-muted-foreground shadow-md">No results</div>
      )}
      {open && dirty && text.trim() && !list.isFetching && items.length === 0 && !!p.buildNew && can("catalogue.write") && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover px-2 py-1.5 text-xs text-muted-foreground shadow-md">
          Not in the list — press Enter to save “{text.trim()}” as new
        </div>
      )}
    </div>
  );
}
