"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { apiGet, type Query } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface EntitySelectProps<T extends { id: string }> {
  /** list endpoint, e.g. "/products" — must support ?q=&pageSize= and GET /:id */
  endpoint: string;
  value: string | null | undefined;
  onChange: (id: string | null, item: T | null) => void;
  getLabel: (item: T) => string;
  getDescription?: (item: T) => React.ReactNode;
  params?: Query;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  className?: string;
  id?: string;
  autoFocus?: boolean;
}

/** Searchable picker for products, parties, godowns… backed by the list endpoint (server search). */
export function EntitySelect<T extends { id: string }>(p: EntitySelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDq(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const list = useQuery({
    queryKey: [p.endpoint, "pick", dq, p.params ?? {}],
    queryFn: () => apiGet<{ items: T[] }>(p.endpoint, { ...p.params, q: dq, pageSize: 20 }),
    enabled: open,
  });
  const selected = useQuery({
    queryKey: [p.endpoint, "one", p.value],
    queryFn: () => apiGet<T>(`${p.endpoint}/${p.value}`),
    enabled: !!p.value,
    staleTime: 60_000,
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={p.id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={p.disabled}
          autoFocus={p.autoFocus}
          className={cn("h-9 w-full min-w-0 justify-between bg-transparent px-2.5 font-normal", !p.value && "text-muted-foreground", p.className)}
        >
          <span className="truncate">{p.value ? (selected.data ? p.getLabel(selected.data) : "Loading…") : (p.placeholder ?? "Select…")}</span>
          <span className="flex items-center gap-1">
            {p.clearable && p.value && (
              <X
                className="size-3.5 opacity-60 hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  p.onChange(null, null);
                }}
              />
            )}
            <ChevronsUpDown className="size-3.5 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-72 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Type to search…" value={q} onValueChange={setQ} />
          <CommandList>
            <CommandEmpty>{list.isLoading ? "Searching…" : "No results"}</CommandEmpty>
            <CommandGroup>
              {list.data?.items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.id}
                  onSelect={() => {
                    p.onChange(item.id, item);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("size-4", p.value === item.id ? "opacity-100" : "opacity-0")} />
                  <div className="min-w-0">
                    <div className="truncate">{p.getLabel(item)}</div>
                    {p.getDescription && <div className="truncate text-[12px] text-muted-foreground">{p.getDescription(item)}</div>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
