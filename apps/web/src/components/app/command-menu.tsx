"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { apiGet } from "@/lib/api";
import { useSession } from "@/lib/session";
import { navGroups } from "./nav";

const Ctx = createContext<{ open: () => void }>({ open: () => undefined });
export const useCommandMenu = () => useContext(Ctx);

interface Hit {
  id: string;
  name: string;
  sku?: string;
  phone?: string;
}

/** Ctrl+K: jump to any page, product or party. */
export function CommandMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const router = useRouter();
  const { can } = useSession();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const term = q.trim();
  const products = useQuery({
    queryKey: ["/products", "cmd", term],
    queryFn: () => apiGet<{ items: Hit[] }>("/products", { q: term, pageSize: 6 }),
    enabled: open && term.length >= 2 && can("catalogue.read"),
  });
  const parties = useQuery({
    queryKey: ["/parties", "cmd", term],
    queryFn: () => apiGet<{ items: Hit[] }>("/parties", { q: term, pageSize: 6 }),
    enabled: open && term.length >= 2 && can("party.read"),
  });

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    router.push(href);
  };

  const pages = navGroups.flatMap((g) => g.items.filter((i) => !i.perm || can(i.perm)).map((i) => ({ ...i, group: g.label })));

  return (
    <Ctx.Provider value={{ open: () => setOpen(true) }}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="overflow-hidden p-0" showCloseButton={false}>
        <DialogTitle className="sr-only">Search</DialogTitle>
        <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-item]]:py-2.5">
        <CommandInput placeholder="Search products, customers, pages…" value={q} onValueChange={setQ} />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          {!!products.data?.items.length && (
            <CommandGroup heading="Products">
              {products.data.items.map((p) => (
                <CommandItem key={p.id} value={`p-${p.id}`} onSelect={() => go(`/catalogue/products/${p.id}`)}>
                  <span className="font-medium">{p.name}</span>
                  <span className="ml-auto text-[12px] text-muted-foreground">{p.sku}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {!!parties.data?.items.length && (
            <CommandGroup heading="Customers & suppliers">
              {parties.data.items.map((p) => (
                <CommandItem key={p.id} value={`c-${p.id}`} onSelect={() => go(`/parties/${p.id}`)}>
                  <span className="font-medium">{p.name}</span>
                  <span className="ml-auto text-[12px] text-muted-foreground">{p.phone}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          <CommandGroup heading="Pages">
            {pages
              .filter((p) => !term || `${p.group} ${p.label}`.toLowerCase().includes(term.toLowerCase()))
              .slice(0, term ? 8 : 40)
              .map((p) => (
                <CommandItem key={p.href} value={p.href} onSelect={() => go(p.href)}>
                  <p.icon className="size-4 text-muted-foreground" />
                  <span>{p.label}</span>
                  {p.group && <span className="ml-auto text-[12px] text-muted-foreground">{p.group}</span>}
                </CommandItem>
              ))}
          </CommandGroup>
        </CommandList>
        </Command>
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  );
}
