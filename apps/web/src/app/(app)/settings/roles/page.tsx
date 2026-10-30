"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { PERMISSIONS, permissionModule, type PermissionCode } from "@gc/shared";
import { PageHeader, Section } from "@/components/common/page-header";
import { ErrorState, LoadingPage } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { api, useApi, useApiMutation } from "@/lib/api";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

interface Role {
  id: string;
  code: string;
  name: string;
  discountLimitPct: number;
  isSystem: boolean;
  permissions: string[];
  userCount: number;
}

const MODULE_LABELS: Record<string, string> = {
  org: "Organisation",
  user: "Users",
  audit: "Audit",
  catalogue: "Catalogue",
  price: "Prices",
  cost: "Cost & margin",
  party: "Parties",
  stock: "Inventory",
  purchase: "Purchase",
  scheme: "Schemes",
  sales: "Sales",
  quotation: "Quotations",
  order: "Orders",
  invoice: "Invoices",
  dispatch: "Dispatch",
  return: "Returns",
  accounts: "Accounts",
  receipt: "Receipts",
  payment: "Payments",
  approval: "Approvals",
  crm: "CRM",
  dashboard: "Dashboard",
  report: "Reports",
  tally: "Tally",
};

export default function RolesPage() {
  const { can } = useSession();
  const canWrite = can("user.write");
  const q = useApi<{ items: Role[] }>("/roles", { pageSize: 100 });
  const [selected, setSelected] = useState<string | null>(null);
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState<number>(0);
  const [newName, setNewName] = useState("");
  const role = q.data?.items.find((r) => r.id === selected) ?? q.data?.items[0];

  useEffect(() => {
    if (role) {
      setSelected(role.id);
      setPerms(new Set(role.permissions));
      setLimit(role.discountLimitPct);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role?.id, q.data]);

  const groups = useMemo(() => {
    const g: Record<string, PermissionCode[]> = {};
    for (const code of Object.keys(PERMISSIONS) as PermissionCode[]) (g[permissionModule(code)] ??= []).push(code);
    return Object.entries(g);
  }, []);

  const savePerms = useApiMutation(() => api(`/roles/${role!.id}/permissions`, { method: "PUT", body: { codes: [...perms] } }), ["/roles"]);
  const saveLimit = useApiMutation(() => api(`/roles/${role!.id}`, { method: "PATCH", body: { discountLimitPct: limit } }), ["/roles"]);
  const create = useApiMutation(
    () => api<Role>("/roles", { method: "POST", body: { name: newName, code: newName.toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 30), discountLimitPct: 0 } }),
    ["/roles"],
  );

  if (q.isLoading) return <LoadingPage />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;

  const toggle = (code: string, on: boolean) =>
    setPerms((p) => {
      const n = new Set(p);
      if (on) n.add(code);
      else n.delete(code);
      return n;
    });

  return (
    <>
      <PageHeader title="Roles & permissions" description="What each role can see and do. The API enforces these on every request." />
      <div className="grid gap-4 md:grid-cols-[240px_1fr]">
        <Section className="h-fit p-2 md:p-2">
          <ul className="space-y-0.5">
            {q.data.items.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => setSelected(r.id)}
                  className={cn("flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[13.5px]", role?.id === r.id ? "bg-fill-strong font-medium" : "hover:bg-fill")}
                >
                  <span>{r.name}</span>
                  <span className="text-[11.5px] text-muted-foreground">{r.userCount} users</span>
                </button>
              </li>
            ))}
          </ul>
          {canWrite && (
            <div className="mt-2 flex gap-1 border-t border-border p-1 pt-2">
              <Input placeholder="New role name" value={newName} onChange={(e) => setNewName(e.target.value)} className="h-8" />
              <Button
                size="icon"
                className="size-8 shrink-0"
                aria-label="Add role"
                disabled={newName.trim().length < 2}
                onClick={() =>
                  create.mutate(undefined, {
                    onSuccess: (r) => {
                      setNewName("");
                      setSelected((r as Role).id);
                      toast.success("Role created");
                    },
                    onError: (e) => toast.error(e.message),
                  })
                }
              >
                <Plus className="size-4" />
              </Button>
            </div>
          )}
        </Section>
        {role && (
          <div className="space-y-4">
            <Section title={`${role.name} · discount limit`}>
              <div className="flex items-end gap-2">
                <label className="flex flex-col gap-1.5 text-[13px]">
                  Max line discount without approval
                  <div className="relative w-40">
                    <Input type="number" min={0} max={100} value={limit} disabled={!canWrite} onChange={(e) => setLimit(Number(e.target.value))} className="pr-8 tabular" />
                    <span className="absolute top-1/2 right-3 -translate-y-1/2 text-[12px] text-muted-foreground">%</span>
                  </div>
                </label>
                {canWrite && (
                  <Button variant="secondary" onClick={() => saveLimit.mutate(undefined, { onSuccess: () => toast.success("Discount limit saved"), onError: (e) => toast.error(e.message) })}>
                    Save limit
                  </Button>
                )}
              </div>
            </Section>
            <Section
              title="Permissions"
              actions={
                canWrite && (
                  <Button size="sm" onClick={() => savePerms.mutate(undefined, { onSuccess: () => toast.success("Permissions saved"), onError: (e) => toast.error(e.message) })} disabled={savePerms.isPending}>
                    Save permissions
                  </Button>
                )
              }
            >
              <div className="grid gap-x-6 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
                {groups.map(([mod, codes]) => (
                  <div key={mod}>
                    <div className="mb-1.5 text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">{MODULE_LABELS[mod] ?? mod}</div>
                    <div className="space-y-1.5">
                      {codes.map((c) => (
                        <label key={c} className="flex items-start gap-2 text-[13px]">
                          <Checkbox checked={perms.has(c)} disabled={!canWrite} onCheckedChange={(v) => toggle(c, !!v)} className="mt-0.5" />
                          <span>
                            {PERMISSIONS[c]}
                            <span className="ml-1 font-mono text-[10.5px] text-muted-foreground">{c}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        )}
      </div>
    </>
  );
}
