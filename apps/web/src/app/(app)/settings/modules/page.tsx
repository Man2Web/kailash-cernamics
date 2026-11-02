"use client";

import { Lock } from "lucide-react";
import { toast } from "sonner";
import { FEATURES, type FeatureFlags, type FeatureKey } from "@gc/shared";
import { PageHeader, Section } from "@/components/common/page-header";
import { ErrorState, LoadingPage } from "@/components/common/states";
import { Switch } from "@/components/ui/switch";
import { api, useApi, useApiMutation } from "@/lib/api";
import { useSession } from "@/lib/session";

const ALWAYS_ON = ["Products & price lists", "Customers & suppliers", "Branches, godowns & vehicles", "Users, roles & this page", "Approvals, notifications & audit log"];

/** The Super Admin turns whole processes on or off. Off means hidden from every menu and dashboard and refused by the server. */
export default function ModulesPage() {
  const { user } = useSession();
  const isOwner = user.role.code === "OWNER";
  const q = useApi<FeatureFlags>("/features");
  const save = useApiMutation((change: Partial<FeatureFlags>) => api<FeatureFlags>("/features", { method: "PUT", body: change }), ["/features"]);

  if (q.isLoading) return <LoadingPage />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const flags = q.data;

  const flip = (key: FeatureKey, label: string, on: boolean) => {
    if (!on && !window.confirm(`Turn off ${label} for everyone, including you? Its menus, dashboard figures and pages disappear. Nothing is deleted, and you can turn it back on here at any time.`)) return;
    save.mutate(
      { [key]: on },
      { onSuccess: () => toast.success(`${label} is now ${on ? "on" : "off"}`), onError: (e) => toast.error(e.message) },
    );
  };

  return (
    <>
      <PageHeader title="Modules on/off" description="Choose which processes your company uses. A module that is off is hidden from everyone, including you." />
      {!isOwner && <p className="mb-4 rounded-lg bg-fill p-3 text-[13.5px]">Only the Super Admin can change this. You can see what is on.</p>}
      <div className="space-y-3">
        {FEATURES.map((f) => (
          <Section key={f.key}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[15px] font-semibold">
                  {f.label}
                  <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-medium ${flags[f.key] ? "bg-ios-green/14 text-ios-green" : "bg-fill text-muted-foreground"}`}>{flags[f.key] ? "On" : "Off"}</span>
                </div>
                <p className="mt-1 text-[13px] text-muted-foreground">{f.description}</p>
                {f.key === "tally" && !flags.tally && (
                  <p className="mt-1 text-[12.5px] text-muted-foreground">While off, documents posted in the meantime wait in the queue and are sent when you turn Tally back on.</p>
                )}
              </div>
              <Switch
                checked={flags[f.key]}
                disabled={!isOwner || save.isPending}
                onCheckedChange={(on) => flip(f.key, f.label, on)}
                aria-label={`${f.label} on or off`}
              />
            </div>
          </Section>
        ))}
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
