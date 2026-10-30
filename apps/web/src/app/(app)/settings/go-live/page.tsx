"use client";

import Link from "next/link";
import { CheckCircle2, CircleAlert, CircleX, ChevronRight } from "lucide-react";
import { PageHeader, Section } from "@/components/common/page-header";
import { ErrorState, LoadingPage } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { useApi } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Check {
  key: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  href?: string;
}

interface Checklist {
  fy: string;
  ready: boolean;
  summary: { pass: number; warn: number; fail: number };
  checks: Check[];
}

const ICON = {
  pass: <CheckCircle2 className="size-5 shrink-0 text-ios-green" />,
  warn: <CircleAlert className="size-5 shrink-0 text-ios-orange" />,
  fail: <CircleX className="size-5 shrink-0 text-ios-red" />,
};

const CHIP: Record<Check["status"], { status: string; label: string }> = {
  pass: { status: "POSTED", label: "Pass" },
  warn: { status: "PENDING", label: "Warning" },
  fail: { status: "FAILED", label: "Fail" },
};

/** Phase 9: what still needs doing before switching branches over from the old process. */
export default function GoLivePage() {
  const q = useApi<Checklist>("/golive/checklist");
  if (q.isLoading) return <LoadingPage />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const d = q.data;
  const order = { fail: 0, warn: 1, pass: 2 } as const;
  const checks = [...d.checks].sort((a, b) => order[a.status] - order[b.status]);

  return (
    <>
      <PageHeader
        title="Go-live checklist"
        description={`Readiness for financial year ${d.fy}. Fix every red item before the cut-over; review the amber ones. The full sign-off sheet is docs/uat.md.`}
        actions={
          <Button variant="secondary" size="sm" onClick={() => q.refetch()}>
            Check again
          </Button>
        }
      />
      <div className="mb-4 grid grid-cols-3 gap-3">
        {(["fail", "warn", "pass"] as const).map((s) => (
          <div key={s} className="rounded-xl bg-card p-4 shadow-card">
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              {ICON[s]} {CHIP[s].label}
            </div>
            <div className="mt-1 text-[26px] font-bold tabular">{d.summary[s]}</div>
          </div>
        ))}
      </div>
      <Section
        title={d.ready ? "No blocking items — ready for the parallel run" : "Not ready yet"}
        className={cn(d.ready ? "ring-1 ring-ios-green/30" : "ring-1 ring-ios-red/25")}
      >
        <ul className="divide-y divide-border">
          {checks.map((c) => {
            const body = (
              <>
                {ICON[c.status]}
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{c.label}</div>
                  <div className="text-[12.5px] text-muted-foreground">{c.detail}</div>
                </div>
                <StatusBadge status={CHIP[c.status].status} label={CHIP[c.status].label} />
                {c.href && <ChevronRight className="size-4 text-muted-foreground" />}
              </>
            );
            return (
              <li key={c.key}>
                {c.href ? (
                  <Link href={c.href} className="-mx-2 flex items-center gap-3 rounded-md px-2 py-3 hover:bg-fill/60">
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 py-3">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      </Section>
    </>
  );
}
