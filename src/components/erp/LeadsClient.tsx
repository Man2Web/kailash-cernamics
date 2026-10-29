"use client";

import React, { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  PhoneCall,
  Plus,
  Search,
  Sparkles,
  Store,
  TrendingUp,
} from "lucide-react";
import SearchSelect from "@/components/erp/SearchSelect";
import { updateLeadAction } from "@/app/(dashboard)/leads/actions";
import {
  LEAD_HEARD_FROM,
  LEAD_PROJECT_TYPES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  LEAD_TIMELINES,
  optionLabel,
} from "@/lib/leads/options";

export interface LeadRow {
  id: string;
  leadNo: string;
  source: string;
  enquiryAt: string; // already formatted for display
  name: string;
  phone: string;
  alternatePhone: string;
  email: string;
  city: string;
  address: string;
  interests: string[];
  requirement: string;
  areaSqft: number | null;
  budget: number | null;
  projectType: string;
  timeline: string;
  heardFrom: string;
  status: string;
  nextFollowUpDate: string; // YYYY-MM-DD or ""
  notes: string;
  assignedToId: string;
  assignedToName: string;
  createdByName: string;
}

interface LeadsClientProps {
  leads: LeadRow[];
  users: { id: string; name: string }[];
  today: string; // YYYY-MM-DD, India time
  canCreate: boolean;
  canUpdate: boolean;
  savedLeadNo?: string;
}

type StatusFilter = "ALL" | "DUE" | "NEW" | "FOLLOW_UP" | "CONVERTED" | "LOST";

const STATUS_STYLES: Record<string, string> = {
  NEW: "bg-blue-50 text-blue-800 border-blue-200",
  FOLLOW_UP: "bg-amber-50 text-amber-800 border-amber-200",
  CONVERTED: "bg-emerald-50 text-emerald-800 border-emerald-200",
  LOST: "bg-slate-100 text-slate-600 border-slate-200",
};

const isOpen = (l: LeadRow) => l.status === "NEW" || l.status === "FOLLOW_UP";
const isDue = (l: LeadRow, today: string) => isOpen(l) && !!l.nextFollowUpDate && l.nextFollowUpDate <= today;

function formatFollowUp(date: string): string {
  if (!date) return "—";
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function LeadsClient({ leads, users, today, canCreate, canUpdate, savedLeadNo }: LeadsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState(savedLeadNo ? `Enquiry ${savedLeadNo} saved.` : "");
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const counts = useMemo(
    () => ({
      due: leads.filter((l) => isDue(l, today)).length,
      NEW: leads.filter((l) => l.status === "NEW").length,
      FOLLOW_UP: leads.filter((l) => l.status === "FOLLOW_UP").length,
      CONVERTED: leads.filter((l) => l.status === "CONVERTED").length,
    }),
    [leads, today]
  );

  const filteredLeads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return leads.filter((l) => {
      if (sourceFilter !== "ALL" && l.source !== sourceFilter) return false;
      if (statusFilter === "DUE" ? !isDue(l, today) : statusFilter !== "ALL" && l.status !== statusFilter) return false;
      if (!q) return true;
      return [l.leadNo, l.name, l.phone, l.alternatePhone, l.city, l.requirement, ...l.interests].some((v) =>
        v.toLowerCase().includes(q)
      );
    });
  }, [leads, searchQuery, sourceFilter, statusFilter, today]);

  const saveLead = (id: string, change: Parameters<typeof updateLeadAction>[1], done?: string) => {
    setErrorMsg("");
    setSuccessMsg("");
    startTransition(async () => {
      const res = await updateLeadAction(id, change);
      if ("error" in res && res.error) {
        setErrorMsg(res.error);
        return;
      }
      if (done) setSuccessMsg(done);
      router.refresh();
    });
  };

  const statCards: { key: StatusFilter; label: string; value: number; icon: React.ReactNode; tone: string }[] = [
    { key: "DUE", label: "Follow-ups due", value: counts.due, icon: <CalendarClock className="h-4 w-4" />, tone: "text-rose-600 bg-rose-50" },
    { key: "NEW", label: "New", value: counts.NEW, icon: <Sparkles className="h-4 w-4" />, tone: "text-blue-600 bg-blue-50" },
    { key: "FOLLOW_UP", label: "In follow-up", value: counts.FOLLOW_UP, icon: <TrendingUp className="h-4 w-4" />, tone: "text-amber-600 bg-amber-50" },
    { key: "CONVERTED", label: "Converted", value: counts.CONVERTED, icon: <CheckCircle className="h-4 w-4" />, tone: "text-emerald-600 bg-emerald-50" },
  ];

  const sourceBadge = (source: string) => {
    const Icon = source === "PHONE_CALL" ? PhoneCall : Store;
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-700 whitespace-nowrap">
        <Icon className="h-3 w-3 text-slate-500" />
        {optionLabel(LEAD_SOURCES, source)}
      </span>
    );
  };

  const statusControl = (l: LeadRow) =>
    canUpdate ? (
      <SearchSelect
        value={l.status}
        onChange={(v) => v !== l.status && saveLead(l.id, { status: v }, `${l.leadNo} marked ${optionLabel(LEAD_STATUSES, v)}.`)}
        disabled={isPending}
        placeholder="Type to search"
        options={LEAD_STATUSES}
        className={`w-full max-w-[9rem] px-2 py-1 rounded text-[11px] font-bold border outline-none ${STATUS_STYLES[l.status] || STATUS_STYLES.NEW}`}
      />
    ) : (
      <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${STATUS_STYLES[l.status] || STATUS_STYLES.NEW}`}>
        {optionLabel(LEAD_STATUSES, l.status)}
      </span>
    );

  const followUpControl = (l: LeadRow) => {
    const overdue = isDue(l, today);
    return canUpdate && isOpen(l) ? (
      <input
        type="date"
        aria-label={`Next follow-up for ${l.leadNo}`}
        value={l.nextFollowUpDate}
        disabled={isPending}
        onChange={(e) =>
          saveLead(
            l.id,
            { nextFollowUpDate: e.target.value || null, ...(e.target.value && l.status === "NEW" ? { status: "FOLLOW_UP" } : {}) },
            e.target.value ? `${l.leadNo} follow-up set for ${formatFollowUp(e.target.value)}.` : `${l.leadNo} follow-up cleared.`
          )
        }
        className={`px-2 py-1 border rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 ${
          overdue ? "border-rose-300 text-rose-700 font-semibold" : "border-slate-200 text-slate-700"
        }`}
      />
    ) : (
      <span className={overdue ? "text-rose-700 font-semibold" : "text-slate-500"}>{formatFollowUp(l.nextFollowUpDate)}</span>
    );
  };

  const details = (l: LeadRow) => (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
      <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 lg:col-span-2">
        <dt className="text-slate-400 font-semibold">Requirement</dt>
        <dd className="text-slate-800 whitespace-pre-line">{l.requirement || "—"}</dd>
        <dt className="text-slate-400 font-semibold">Area / Budget</dt>
        <dd className="text-slate-800">
          {l.areaSqft ? `${l.areaSqft.toLocaleString("en-IN")} sq.ft` : "—"} · {l.budget ? `₹${l.budget.toLocaleString("en-IN")}` : "—"}
        </dd>
        <dt className="text-slate-400 font-semibold">Project / Timeline</dt>
        <dd className="text-slate-800">
          {optionLabel(LEAD_PROJECT_TYPES, l.projectType)} · {optionLabel(LEAD_TIMELINES, l.timeline)}
        </dd>
        <dt className="text-slate-400 font-semibold">Heard about us</dt>
        <dd className="text-slate-800">{optionLabel(LEAD_HEARD_FROM, l.heardFrom)}</dd>
        <dt className="text-slate-400 font-semibold">Contact</dt>
        <dd className="text-slate-800">
          {[l.phone, l.alternatePhone, l.email].filter(Boolean).join(" · ")}
          {l.address && <span className="block text-slate-500">{l.address}</span>}
        </dd>
        <dt className="text-slate-400 font-semibold">Recorded by</dt>
        <dd className="text-slate-800">
          {l.createdByName} on {l.enquiryAt}
        </dd>
      </dl>

      <div className="space-y-3">
        <div className="space-y-1">
          <span className="block text-slate-400 font-semibold">Salesperson</span>
          {canUpdate ? (
            <SearchSelect
              value={l.assignedToId}
              onChange={(v) => v !== l.assignedToId && saveLead(l.id, { assignedToId: v }, `${l.leadNo} assigned.`)}
              disabled={isPending}
              placeholder="Type to search staff"
              options={users.map((u) => ({ value: u.id, label: u.name }))}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          ) : (
            <span className="text-slate-800">{l.assignedToName || "Not assigned"}</span>
          )}
        </div>
        <div className="space-y-1">
          <label htmlFor={`notes-${l.id}`} className="block text-slate-400 font-semibold">
            Notes
          </label>
          {canUpdate ? (
            <>
              <textarea
                id={`notes-${l.id}`}
                rows={3}
                value={noteDrafts[l.id] ?? l.notes}
                onChange={(e) => setNoteDrafts((d) => ({ ...d, [l.id]: e.target.value }))}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {noteDrafts[l.id] !== undefined && noteDrafts[l.id] !== l.notes && (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => saveLead(l.id, { notes: noteDrafts[l.id] }, `${l.leadNo} notes saved.`)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-semibold disabled:opacity-60 transition"
                >
                  Save notes
                </button>
              )}
            </>
          ) : (
            <p className="text-slate-800 whitespace-pre-line">{l.notes || "—"}</p>
          )}
        </div>
      </div>
    </div>
  );

  const interestChips = (l: LeadRow) =>
    l.interests.length === 0 ? (
      <span className="text-slate-400">—</span>
    ) : (
      <div className="flex flex-wrap gap-1">
        {l.interests.map((i) => (
          <span key={i} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-medium">
            {i}
          </span>
        ))}
      </div>
    );

  const expandButton = (l: LeadRow) => (
    <button
      type="button"
      onClick={() => setExpandedId(expandedId === l.id ? null : l.id)}
      aria-expanded={expandedId === l.id}
      className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-semibold transition"
    >
      {expandedId === l.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      Details
    </button>
  );

  return (
    <div className="space-y-4">
      {successMsg && (
        <div role="status" className="p-3 rounded border text-xs flex items-center space-x-2 bg-emerald-50 border-emerald-200 text-emerald-800">
          <CheckCircle className="h-4 w-4 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div role="alert" className="p-3 rounded border text-xs flex items-center space-x-2 bg-red-50 border-red-200 text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Summary cards double as quick filters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setStatusFilter(statusFilter === c.key ? "ALL" : c.key)}
            aria-pressed={statusFilter === c.key}
            className={`flex items-center gap-3 p-3 sm:p-4 bg-white border rounded-lg shadow-xs text-left transition ${
              statusFilter === c.key ? "border-blue-500 ring-2 ring-blue-500/20" : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <span className={`h-9 w-9 shrink-0 flex items-center justify-center rounded-lg ${c.tone}`}>{c.icon}</span>
            <span className="min-w-0">
              <span className="block text-lg font-bold text-slate-900 leading-tight">{c.value}</span>
              <span className="block text-[11px] font-semibold text-slate-500 truncate">{c.label}</span>
            </span>
          </button>
        ))}
      </div>

      {/* Action Toolbar */}
      <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-3 bg-white p-3 border border-slate-200 rounded shadow-xs">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center w-full lg:flex-1 min-w-0">
          <div className="relative w-full sm:max-w-xs">
            <Search className="h-4 w-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, phone, lead no..."
              className="pl-9 pr-4 py-2 sm:py-1.5 w-full border border-slate-200 rounded-sm text-xs bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-900 focus:bg-white min-h-[36px] sm:min-h-0"
            />
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by enquiry type">
            {[{ value: "ALL", label: "All" }, ...LEAD_SOURCES].map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setSourceFilter(s.value)}
                aria-pressed={sourceFilter === s.value}
                className={`px-3 py-1.5 rounded-full border text-[11px] font-semibold transition ${
                  sourceFilter === s.value ? "bg-slate-900 border-slate-900 text-white" : "bg-white border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {s.label}
              </button>
            ))}
            {statusFilter !== "ALL" && (
              <button
                type="button"
                onClick={() => setStatusFilter("ALL")}
                className="px-3 py-1.5 rounded-full border border-blue-200 bg-blue-50 text-blue-700 text-[11px] font-semibold"
              >
                {statusFilter === "DUE" ? "Follow-ups due" : optionLabel(LEAD_STATUSES, statusFilter)} ✕
              </button>
            )}
          </div>
        </div>

        {canCreate && (
          <button
            type="button"
            onClick={() => router.push("/leads/new")}
            className="w-full sm:w-auto flex items-center justify-center space-x-1.5 px-3.5 py-2 sm:py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-sm text-xs font-semibold shadow-xs transition min-h-[36px] sm:min-h-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Enquiry</span>
          </button>
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden xl:block bg-white border border-slate-200 rounded-sm shadow-xs">
        <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
          <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
            <tr>
              <th className="px-4 py-3">Lead / Date</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Interested In</th>
              <th className="px-4 py-3">Salesperson</th>
              <th className="px-4 py-3">Next Follow-up</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {filteredLeads.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                  {leads.length === 0 ? "No enquiries recorded yet." : "No enquiries match these filters."}
                </td>
              </tr>
            ) : (
              filteredLeads.map((l) => (
                <React.Fragment key={l.id}>
                  <tr className={expandedId === l.id ? "bg-slate-50/70" : "hover:bg-slate-50/50"}>
                    <td className="px-4 py-3">
                      <span className="block font-mono font-bold text-slate-900">{l.leadNo}</span>
                      <span className="block text-slate-500">{l.enquiryAt}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="block font-semibold text-slate-900">{l.name}</span>
                      <a href={`tel:${l.phone}`} className="block text-blue-600 hover:underline">
                        {l.phone}
                      </a>
                      {l.city && <span className="block text-slate-400">{l.city}</span>}
                    </td>
                    <td className="px-4 py-3">{sourceBadge(l.source)}</td>
                    <td className="px-4 py-3 max-w-[16rem]">{interestChips(l)}</td>
                    <td className="px-4 py-3 text-slate-800">{l.assignedToName || <span className="text-slate-400">Not assigned</span>}</td>
                    <td className="px-4 py-3">{followUpControl(l)}</td>
                    <td className="px-4 py-3">{statusControl(l)}</td>
                    <td className="px-4 py-3 text-right">{expandButton(l)}</td>
                  </tr>
                  {expandedId === l.id && (
                    <tr className="bg-slate-50/70">
                      <td colSpan={8} className="px-4 pb-4 pt-1">
                        {details(l)}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Card View (below xl) */}
      <div className="xl:hidden grid grid-cols-1 lg:grid-cols-2 gap-3">
        {filteredLeads.length === 0 ? (
          <div className="bg-white p-6 text-center text-slate-400 border border-slate-200 rounded-sm lg:col-span-2">
            {leads.length === 0 ? "No enquiries recorded yet." : "No enquiries match these filters."}
          </div>
        ) : (
          filteredLeads.map((l) => (
            <div key={l.id} className="bg-white p-4 border border-slate-200 rounded-lg shadow-xs space-y-3 text-xs">
              <div className="flex justify-between items-start gap-2 border-b border-slate-100 pb-2.5">
                <div className="min-w-0">
                  <span className="block font-semibold text-sm text-slate-900">{l.name}</span>
                  <a href={`tel:${l.phone}`} className="text-blue-600 hover:underline">
                    {l.phone}
                  </a>
                  {l.city && <span className="text-slate-400"> · {l.city}</span>}
                </div>
                {sourceBadge(l.source)}
              </div>
              <div className="flex justify-between gap-2 text-slate-500">
                <span className="font-mono font-bold text-slate-700">{l.leadNo}</span>
                <span>{l.enquiryAt}</span>
              </div>
              {interestChips(l)}
              <div className="grid grid-cols-2 gap-3 items-end">
                <div className="space-y-1">
                  <span className="block text-[11px] uppercase font-bold text-slate-400">Status</span>
                  {statusControl(l)}
                </div>
                <div className="space-y-1">
                  <span className="block text-[11px] uppercase font-bold text-slate-400">Next follow-up</span>
                  {followUpControl(l)}
                </div>
              </div>
              <div className="flex justify-between items-center pt-1">
                <span className="text-slate-500">{l.assignedToName || "Not assigned"}</span>
                {expandButton(l)}
              </div>
              {expandedId === l.id && <div className="border-t border-slate-100 pt-3">{details(l)}</div>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
