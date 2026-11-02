"use client";

import Link from "next/link";
import { LogIn, LogOut } from "lucide-react";
import { Section } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/states";
import { useApi } from "@/lib/api";
import { useSession } from "@/lib/session";

interface TodayRow {
  employeeId: string;
  employeeNo: string;
  name: string;
  jobTitle: string;
  status: string;
}
interface TodayEvent {
  type: "CHECK_IN" | "CHECK_OUT";
  at: string;
  employeeId: string;
  name: string;
  employeeNo: string;
  status: string;
}
interface Today {
  date: string;
  summary: { total: number; present: number; late: number; onLeave: number; notMarked: number };
  events: TodayEvent[];
  rows: TodayRow[];
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg bg-fill px-3 py-2">
      <div className="text-[11.5px] text-muted-foreground">{label}</div>
      <div className={`text-[20px] font-bold tabular-nums ${tone ?? ""}`}>{value}</div>
    </div>
  );
}

/**
 * Live attendance for the dashboard: counts, the latest check-ins and check-outs, and who has not checked in yet.
 * Refreshes every few seconds, so a scan at the office QR screen shows up here almost immediately.
 */
export function AttendanceTodayCard() {
  const { can } = useSession();
  const allowed = can("attendance.read");
  const q = useApi<Today>(allowed ? "/attendance/today" : null, undefined, { refetchInterval: 8_000 });
  if (!allowed) return null;

  const d = q.data;
  const waiting = d?.rows.filter((r) => r.status === "NOT_MARKED") ?? [];

  return (
    <Section
      title="Employee attendance · today"
      actions={
        <Link href="/office/attendance" className="text-[13px] text-tint hover:underline">
          Open
        </Link>
      }
      className="mt-4"
    >
      {!d ? (
        <p className="py-6 text-center text-[13px] text-muted-foreground">{q.isError ? "Could not load attendance" : "Loading…"}</p>
      ) : d.summary.total === 0 ? (
        <EmptyState title="No employees yet" description="Add employees under Office → Employees." className="py-6" />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <Stat label="Employees" value={d.summary.total} />
            <Stat label="Present" value={d.summary.present} tone="text-ios-green" />
            <Stat label="Late" value={d.summary.late} tone={d.summary.late ? "text-ios-orange" : undefined} />
            <Stat label="On leave" value={d.summary.onLeave} />
            <Stat label="Not checked in" value={d.summary.notMarked} tone={d.summary.notMarked ? "text-ios-red" : undefined} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="mb-1 text-[12px] font-medium text-muted-foreground">Latest check-ins and check-outs</div>
              {d.events.length === 0 ? (
                <p className="py-3 text-[13px] text-muted-foreground">Nobody has scanned yet today.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {d.events.slice(0, 6).map((e) => (
                    <li key={e.type + e.employeeId + e.at} className="flex items-center justify-between gap-2 py-1.5 text-[13px]">
                      <span className="flex min-w-0 items-center gap-2">
                        {e.type === "CHECK_IN" ? <LogIn className="size-4 shrink-0 text-ios-green" /> : <LogOut className="size-4 shrink-0 text-muted-foreground" />}
                        <span className="truncate">
                          <span className="font-medium">{e.name}</span> {e.type === "CHECK_IN" ? "checked in" : "checked out"}
                          {e.type === "CHECK_IN" && e.status === "LATE" && <span className="ml-1 text-ios-orange">· late</span>}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{clock(e.at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <div className="mb-1 text-[12px] font-medium text-muted-foreground">Not checked in yet</div>
              {waiting.length === 0 ? (
                <p className="py-3 text-[13px] text-muted-foreground">Everyone has checked in.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {waiting.slice(0, 6).map((r) => (
                    <li key={r.employeeId} className="flex items-center justify-between gap-2 py-1.5 text-[13px]">
                      <span className="truncate font-medium">{r.name}</span>
                      <span className="shrink-0 text-[12px] text-muted-foreground">{r.jobTitle}</span>
                    </li>
                  ))}
                  {waiting.length > 6 && <li className="py-1.5 text-[12px] text-muted-foreground">and {waiting.length - 6} more</li>}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}
