"use client";

import { useMemo } from "react";
import { Lock } from "lucide-react";
import { useApi } from "@/lib/api";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/common/page-header";

export interface AccessValue {
  /** false = whatever the role gives; true = exactly `codes`. */
  useCustomAccess: boolean;
  codes: string[];
}

interface Permission {
  id: string;
  code: string;
  label: string;
  module: string;
}

// Plain-language names for the permission groups, in the order a Super Admin thinks about the business.
const GROUPS: { module: string; title: string; note?: string }[] = [
  { module: "sales", title: "Sales" },
  { module: "quotation", title: "Quotations" },
  { module: "order", title: "Sales orders" },
  { module: "invoice", title: "Invoices" },
  { module: "dispatch", title: "Challans & dispatch" },
  { module: "return", title: "Sales returns & credit notes" },
  { module: "purchase", title: "Purchase" },
  { module: "scheme", title: "Brand schemes" },
  { module: "stock", title: "Inventory & stock" },
  { module: "sample", title: "Samples & display boards" },
  { module: "claim", title: "Supplier breakage claims" },
  { module: "catalogue", title: "Products & catalogue" },
  { module: "price", title: "Price lists" },
  { module: "cost", title: "Cost prices & margins", note: "Sensitive: shows what things cost you" },
  { module: "party", title: "Customers & suppliers" },
  { module: "crm", title: "Leads & site visits" },
  { module: "accounts", title: "Accounts (receipts, payments, outstanding)" },
  { module: "receipt", title: "Record receipts" },
  { module: "payment", title: "Record supplier payments" },
  { module: "approval", title: "Approvals" },
  { module: "report", title: "Reports" },
  { module: "dashboard", title: "Super Admin dashboard" },
  { module: "employee", title: "Employees" },
  { module: "attendance", title: "Attendance" },
  { module: "org", title: "Company, branches & settings" },
  { module: "user", title: "Users & roles", note: "Sensitive: can create logins" },
  { module: "audit", title: "Audit log & login history" },
  { module: "tally", title: "Tally", note: "Super Admin decides. Off for every role by default." },
];

/**
 * The Super Admin chooses what one person can see and do. By default they follow their role; switching to "choose
 * exactly" shows every function in plain groups to tick or untick. The server checks every request against this.
 */
export function AccessPicker({
  value,
  onChange,
  roleName,
  roleDefaults,
}: {
  value: AccessValue;
  onChange: (v: AccessValue) => void;
  roleName?: string;
  roleDefaults: string[];
}) {
  const catalog = useApi<Permission[]>("/permissions");

  const grouped = useMemo(() => {
    const byModule = new Map<string, Permission[]>();
    for (const p of catalog.data ?? []) byModule.set(p.module, [...(byModule.get(p.module) ?? []), p]);
    const known = new Set(GROUPS.map((g) => g.module));
    const out = GROUPS.filter((g) => byModule.has(g.module)).map((g) => ({ ...g, items: byModule.get(g.module)! }));
    for (const [module, items] of byModule) if (!known.has(module)) out.push({ module, title: module, items });
    return out;
  }, [catalog.data]);

  const chosen = new Set(value.codes);
  const set = (codes: Iterable<string>) => onChange({ useCustomAccess: true, codes: [...new Set(codes)] });
  const toggle = (code: string, on: boolean) => {
    const next = new Set(chosen);
    if (on) next.add(code);
    else next.delete(code);
    set(next);
  };

  return (
    <Section title="3. What this employee can see and do">
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onChange({ useCustomAccess: false, codes: value.codes })}
            className={`rounded-lg border p-3 text-left text-[13.5px] transition ${!value.useCustomAccess ? "border-tint bg-tint/5" : "border-border hover:bg-fill"}`}
          >
            <div className="font-medium">Use the role&apos;s access</div>
            <div className="mt-0.5 text-[12.5px] text-muted-foreground">
              {roleName ? `Everything a "${roleName}" can do.` : "Choose a role first."} Tally is not included.
            </div>
          </button>
          <button
            type="button"
            onClick={() => onChange({ useCustomAccess: true, codes: value.codes.length ? value.codes : roleDefaults })}
            className={`rounded-lg border p-3 text-left text-[13.5px] transition ${value.useCustomAccess ? "border-tint bg-tint/5" : "border-border hover:bg-fill"}`}
          >
            <div className="font-medium">Choose exactly what they can see</div>
            <div className="mt-0.5 text-[12.5px] text-muted-foreground">Tick the functions. Anything not ticked is hidden from them.</div>
          </button>
        </div>

        {value.useCustomAccess && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={() => set(roleDefaults)}>
                Start from the role
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => set((catalog.data ?? []).map((p) => p.code))}>
                Select everything
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => set([])}>
                Clear all
              </Button>
              <span className="ml-auto text-[12.5px] text-muted-foreground">{chosen.size} selected</span>
            </div>
            {catalog.isLoading && <p className="text-[13px] text-muted-foreground">Loading…</p>}
            <div className="grid gap-3 md:grid-cols-2">
              {grouped.map((g) => {
                const all = g.items.every((p) => chosen.has(p.code));
                const some = g.items.some((p) => chosen.has(p.code));
                return (
                  <div key={g.module} className={`rounded-lg border p-3 ${g.module === "tally" ? "border-ios-orange/50 bg-ios-orange/5" : "border-border"}`}>
                    <label className="flex items-center gap-2 text-[13.5px] font-semibold">
                      <Checkbox
                        checked={all ? true : some ? "indeterminate" : false}
                        onCheckedChange={(c) => {
                          const next = new Set(chosen);
                          for (const p of g.items) (c ? next.add(p.code) : next.delete(p.code));
                          set(next);
                        }}
                      />
                      {g.title}
                      {g.module === "tally" && <Lock className="size-3.5 text-ios-orange" />}
                    </label>
                    {g.note && <p className="ml-6 mt-0.5 text-[12px] text-muted-foreground">{g.note}</p>}
                    <ul className="ml-6 mt-2 space-y-1.5">
                      {g.items.map((p) => (
                        <li key={p.code}>
                          <label className="flex items-start gap-2 text-[13px]">
                            <Checkbox className="mt-0.5" checked={chosen.has(p.code)} onCheckedChange={(c) => toggle(p.code, !!c)} />
                            <span>{p.label}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </>
        )}
        <p className="text-[12.5px] text-muted-foreground">Only the Super Admin can see or change this. You can come back and change it at any time.</p>
      </div>
    </Section>
  );
}
