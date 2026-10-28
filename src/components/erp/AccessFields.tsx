"use client";

import React from "react";
import { PRIMARY_ROLE_OPTIONS, EXTRA_ACCESS_OPTIONS, roleLabel } from "@/lib/auth/access";

interface RoleBadgesProps {
  role: string;
  roles?: string[];
}

/** The member's main role plus a badge for every extra access they hold. */
export function RoleBadges({ role, roles }: RoleBadgesProps) {
  const tone = (r: string) =>
    r === "SUPER_ADMIN" || r === "ADMIN"
      ? "bg-purple-100 text-purple-700"
      : r.includes("WAREHOUSE") || r === "INVENTORY_STAFF"
      ? "bg-amber-100 text-amber-800"
      : r === "ATTENDANCE_MANAGER"
      ? "bg-teal-100 text-teal-800"
      : "bg-blue-100 text-blue-700";
  const extras = (roles || []).filter((r) => r !== role);
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${tone(role)}`}>{roleLabel(role)}</span>
      {extras.map((r) => (
        <span key={r} className={`px-2 py-0.5 rounded text-[11px] font-semibold border border-dashed ${tone(r)}`} title="Extra access">
          + {roleLabel(r)}
        </span>
      ))}
    </span>
  );
}

interface PrimaryRoleSelectProps {
  value: string;
  onChange: (value: string) => void;
}

export function PrimaryRoleSelect({ value, onChange }: PrimaryRoleSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500 font-medium"
    >
      {PRIMARY_ROLE_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

interface ExtraAccessChecklistProps {
  primary: string;
  selected: string[];
  onToggle: (value: string) => void;
}

/** Extra access the Super Admin can add on top of the main role. */
export function ExtraAccessChecklist({ primary, selected, onToggle }: ExtraAccessChecklistProps) {
  if (primary === "SUPER_ADMIN") {
    return (
      <div className="p-2.5 bg-purple-50 border border-purple-100 rounded text-[11px] text-purple-800">
        A Super Admin already has access to everything, so no extra access is needed.
      </div>
    );
  }
  const options = EXTRA_ACCESS_OPTIONS.filter((o) => o.value !== primary);
  return (
    <div className="space-y-1.5">
      <label className="font-semibold text-slate-700">Extra access (optional)</label>
      <p className="text-[11px] text-slate-500">Tick anything this member should be able to open in addition to their main role.</p>
      <div className="space-y-1.5">
        {options.map((o) => {
          const checked = selected.includes(o.value);
          return (
            <label
              key={o.value}
              className={`flex items-start gap-2.5 p-2.5 border rounded cursor-pointer transition ${
                checked ? "border-blue-300 bg-blue-50/60" : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(o.value)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-slate-800">{o.label}</span>
                <span className="block text-[11px] text-slate-500">{o.help}</span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
