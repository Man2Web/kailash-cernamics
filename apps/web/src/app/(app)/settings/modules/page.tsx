"use client";

import { Lock } from "lucide-react";
import { toast } from "sonner";
import { type AnyFeatureKey, FEATURE_PARTS, FEATURES, type FeatureFlags } from "@gc/shared";
import { PageHeader, Section } from "@/components/common/page-header";
import { ErrorState, LoadingPage } from "@/components/common/states";
import { Switch } from "@/components/ui/switch";
import { api, useApi, useApiMutation } from "@/lib/api";
import { useSession } from "@/lib/session";

const ALWAYS_ON = ["Products & price lists", "Customers & suppliers", "Branches, godowns & vehicles", "Users, roles & this page", "Approvals, notifications & audit log"];

/** The Super Admin turns whole processes, or single parts of one, on or off. Off means hidden from every menu and button and refused by the server. */
export default function ModulesPage() {
  const { user } = useSession();
  const isOwner = user.role.code === "OWNER";
  const q = useApi<FeatureFlags>("/features");
  const save = useApiMutation((change: Partial<FeatureFlags>) => api<FeatureFlags>("/features", { method: "PUT", body: change }), ["/features"]);

  if (q.isLoading) return <LoadingPage />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const flags = q.data;

  const flip = (key: AnyFeatureKey, label: string, on: boolean, isPart: boolean) => {
    if (!on && !window.confirm(`Turn off ${label} for everyone, including you? ${isPart ? "Its menu entry, buttons and pages disappear." : "Its menus, dashboard figures and pages disappear, and so do all its parts."} Nothing is deleted, and you can turn it back on here at any time.`)) return;
    save.mutate(
      { [key]: on },
      { onSuccess: () => toast.success(`${label} is now ${on ? "on" : "off"}`), onError: (e) => toast.error(e.message) },
    );
  };

  return (
    <>
      <PageHeader title="Modules on/off" description="Choose which processes, and which parts of them, your company uses. Whatever is off is hidden from everyone, including you." />
      {!isOwner && <p className="mb-4 rounded-lg bg-fill p-3 text-[13.5px]">Only the Super Admin can change this. You can see what is on.</p>}
      <div className="space-y-3">
        {FEATURES.map((f) => {
          const moduleOn = flags[f.key];
          const parts = FEATURE_PARTS.filter((p) => p.module === f.key);
          return (
            <Section key={f.key}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[15px] font-semibold">
                    {f.label}
                    <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-medium ${moduleOn ? "bg-ios-green/14 text-ios-green" : "bg-fill text-muted-foreground"}`}>{moduleOn ? "On" : "Off"}</span>
                  </div>
                  <p className="mt-1 text-[13px] text-muted-foreground">{f.description}</p>
                  {f.key === "tally" && !moduleOn && (
                    <p className="mt-1 text-[12.5px] text-muted-foreground">While off, documents posted in the meantime wait in the queue and are sent when you turn Tally back on.</p>
                  )}
                </div>
                <Switch
                  checked={moduleOn}
                  disabled={!isOwner || save.isPending}
                  onCheckedChange={(on) => flip(f.key, f.label, on, false)}
                  aria-label={`${f.label} on or off`}
                />
              </div>
              {parts.length > 0 && (
                <div className="mt-3 border-t border-separator pt-1">
                  {!moduleOn && <p className="py-2 text-[12.5px] text-muted-foreground">{f.label} is off, so all its parts are off. Each part keeps its own setting for when you turn {f.label} back on.</p>}
                  <ul className="divide-y divide-separator">
                    {parts.map((p) => {
                      const partOn = flags[p.key];
                      return (
                        <li key={p.key} className="flex items-center justify-between gap-4 py-2.5 pl-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-[14px] font-medium">
                              {p.label}
                              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${partOn && moduleOn ? "bg-ios-green/14 text-ios-green" : "bg-fill text-muted-foreground"}`}>{partOn && moduleOn ? "On" : "Off"}</span>
                            </div>
                            <p className="text-[12.5px] text-muted-foreground">{p.description}</p>
                          </div>
                          <Switch
                            checked={partOn}
                            disabled={!isOwner || save.isPending || !moduleOn}
                            onCheckedChange={(on) => flip(p.key, p.label, on, true)}
                            aria-label={`${p.label} on or off`}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </Section>
          );
        })}
        <Section title="Always on">
          <p className="mb-2 flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <Lock className="size-3.5" /> These are the foundation of every other process, so they cannot be switched off.
          </p>
          <ul className="list-disc pl-5 text-[13.5px]">
            {ALWAYS_ON.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Section>
      </div>
    </>
  );
}
