"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, Pencil } from "lucide-react";
import { PageHeader, Section } from "@/components/common/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { NativeSelect } from "@/components/common/form-fields";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApi } from "@/lib/api";
import { exportToExcel } from "@/lib/export";
import { useSession } from "@/lib/session";

interface TodayRow {
  employeeId: string;
  employeeNo: string;
  name: string;
  jobTitle: string;
  status: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  workingHours: string;
  method: string | null;
}
interface Event {
  type: "CHECK_IN" | "CHECK_OUT";
  at: string;
  employeeId: string;
  name: string;
  employeeNo: string;
  status: string;
}
interface Today {
  date: string;
  events: Event[];
  summary: { total: number; present: number; late: number; onLeave: number; notMarked: number };
  rows: TodayRow[];
}
interface MonthRow {
  employeeId: string;
  employeeNo: string;
  name: string;
  jobTitle: string;
  workingDays: number;
  presentDays: number;
  lateDays: number;
  halfDays: number;
  leaveDays: number;
  absentDays: number;
  totalWorkingHours: string;
  records: { attendanceDate: string; status: string; checkInAt: string | null; checkOutAt: string | null; workingHours: string; method: string }[];
}
interface Month {
  year: number;
  month: number;
  workingDays: number;
  summaries: MonthRow[];
}

const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true }) : "—";

const th = "px-3 py-2 text-left text-[12px] font-medium text-muted-foreground whitespace-nowrap";
const td = "px-3 py-2 text-[13.5px] whitespace-nowrap";

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl bg-card p-4 shadow-card">
      <div className="text-[12px] text-muted-foreground">{label}</div>
      <div className="mt-1 text-[24px] font-bold tabular-nums">{value}</div>
    </div>
  );
}

const istToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

function TodayTab() {
  const { can } = useSession();
  const [date, setDate] = useState(istToday);
  const isToday = date === istToday();
  // Today refreshes by itself every few seconds so arrivals and departures show up as employees scan.
  const q = useApi<Today>("/attendance/today", { date }, { refetchInterval: isToday ? 8_000 : false });
  if (q.isLoading) return <LoadingRows />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const d = q.data!;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={date}
          max={istToday()}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-2.5 text-[14px]"
          aria-label="Attendance date"
        />
        {!isToday && (
          <Button variant="secondary" size="sm" onClick={() => setDate(istToday())}>
            Back to today
          </Button>
        )}
        {isToday && <span className="text-[12px] text-muted-foreground">Live · updates every few seconds</span>}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Employees" value={d.summary.total} />
        <Stat label="Present" value={d.summary.present} />
        <Stat label="Late" value={d.summary.late} />
        <Stat label="On leave" value={d.summary.onLeave} />
        <Stat label="Not marked" value={d.summary.notMarked} />
      </div>
      {d.events.length > 0 && (
        <Section title="Recent check-ins and check-outs">
          <ul className="divide-y divide-border">
            {d.events.map((e) => (
              <li key={e.type + e.employeeId + e.at} className="flex items-center justify-between gap-3 py-2 text-[13.5px]">
                <span>
                  <span className="font-medium">{e.name}</span> <span className="text-muted-foreground">({e.employeeNo})</span>{" "}
                  {e.type === "CHECK_IN" ? "checked in" : "checked out"}
                  {e.type === "CHECK_IN" && e.status === "LATE" && <span className="ml-1.5 text-ios-orange">· late</span>}
                </span>
                <span className="tabular-nums text-muted-foreground">{time(e.at)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title={isToday ? `Today · ${d.date}` : d.date}>
        {d.rows.length === 0 ? (
          <EmptyState title="No employees yet" description="Add employees under Office → Employees." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>Employee</th>
                  <th className={th}>Status</th>
                  <th className={th}>Check-in</th>
                  <th className={th}>Check-out</th>
                  <th className={th}>Worked</th>
                  <th className={th}>Via</th>
                  {can("attendance.manage") && <th className={th} />}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {d.rows.map((r) => (
                  <tr key={r.employeeId}>
                    <td className={td}>
                      <div className="font-medium">{r.name}</div>
                      <div className="text-[12px] text-muted-foreground">{r.employeeNo} · {r.jobTitle}</div>
                    </td>
                    <td className={td}><StatusBadge status={r.status} /></td>
                    <td className={td}>{time(r.checkInAt)}</td>
                    <td className={td}>{time(r.checkOutAt)}</td>
                    <td className={td}>{r.workingHours}</td>
                    <td className={td}>{r.method === "ADMIN" ? "Office" : r.method === "QR" ? "QR" : "—"}</td>
                    {can("attendance.manage") && (
                      <td className={td}>
                        <Link href={`/office/attendance/correct?employeeId=${r.employeeId}&date=${d.date}`} className="inline-flex items-center gap-1 text-tint hover:underline">
                          <Pencil className="size-3.5" /> {r.status === "NOT_MARKED" ? "Mark" : "Correct"}
                        </Link>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

function MonthTab() {
  const { can } = useSession();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const q = useApi<Month>("/attendance/month", { year, month });
  const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const exportXlsx = () => {
    if (!q.data) return;
    void exportToExcel(
      `attendance-${year}-${String(month).padStart(2, "0")}`,
      [
        { header: "Employee ID", key: "employeeNo", width: 14 },
        { header: "Name", key: "name", width: 24 },
        { header: "Role", key: "jobTitle", width: 18 },
        { header: "Working days", key: "workingDays", width: 14 },
        { header: "Present", key: "presentDays", width: 10 },
        { header: "Late", key: "lateDays", width: 8 },
        { header: "Half day", key: "halfDays", width: 10 },
        { header: "Leave", key: "leaveDays", width: 8 },
        { header: "Absent", key: "absentDays", width: 10 },
        { header: "Total hours", key: "totalWorkingHours", width: 14 },
      ],
      q.data.summaries as unknown as Record<string, unknown>[],
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-40">
          {names.map((n, i) => (
            <option key={n} value={i + 1}>{n}</option>
          ))}
        </NativeSelect>
        <NativeSelect value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-28">
          {[now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </NativeSelect>
        {can("attendance.manage") && (
          <Button variant="secondary" onClick={exportXlsx} disabled={!q.data?.summaries.length}>
            <Download className="size-4" /> Export Excel
          </Button>
        )}
      </div>
      {q.isLoading ? (
        <LoadingRows />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        <Section title={`${names[month - 1]} ${year} · ${q.data!.workingDays} working days (Sundays off)`}>
          {q.data!.summaries.length === 0 ? (
            <EmptyState title="No employees yet" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className={th}>Employee</th>
                    <th className={th}>Present</th>
                    <th className={th}>Late</th>
                    <th className={th}>Half day</th>
                    <th className={th}>Leave</th>
                    <th className={th}>Absent</th>
                    <th className={th}>Hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {q.data!.summaries.map((s) => (
                    <tr key={s.employeeId}>
                      <td className={td}>
                        <div className="font-medium">{s.name}</div>
                        <div className="text-[12px] text-muted-foreground">{s.employeeNo} · {s.jobTitle}</div>
                      </td>
                      <td className={td}>{s.presentDays}</td>
                      <td className={td}>{s.lateDays}</td>
                      <td className={td}>{s.halfDays}</td>
                      <td className={td}>{s.leaveDays}</td>
                      <td className={td}>{s.absentDays}</td>
                      <td className={td}>{s.totalWorkingHours}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}
    </div>
  );
}

export default function AttendancePage() {
  return (
    <>
      <PageHeader title="Attendance" description="Who is in today, and the monthly summary. Employees check in by scanning the QR code on the attendance screen." />
      <Tabs defaultValue="today">
        <TabsList>
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="month">Monthly</TabsTrigger>
        </TabsList>
        <TabsContent value="today" className="mt-4">
          <TodayTab />
        </TabsContent>
        <TabsContent value="month" className="mt-4">
          <MonthTab />
        </TabsContent>
      </Tabs>
    </>
  );
}
