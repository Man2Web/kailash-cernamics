"use client";

import React from "react";
import { PRIMARY_ROLE_OPTIONS, roleLabel } from "@/lib/auth/access";
import { PERMISSION_GROUPS } from "@/lib/auth/permissions";
import SearchSelect from "@/components/erp/SearchSelect";

interface RoleBadgesProps {
  role: string;
  roles?: string[];
  /** Number of individually chosen permissions (when a Super Admin customised this member). */
  customCount?: number | null;
}

/** The member's role plus a note when their permissions were customised. */
export function RoleBadges({ role, roles, customCount }: RoleBadgesProps) {
  const tone = (r: string) =>
    r === "SUPER_ADMIN" || r === "ADMIN"
      ? "bg-purple-100 text-purple-700"
      : r.includes("WAREHOUSE") || r === "INVENTORY_STAFF"
      ? "bg-amber-100 text-amber-800"
      : r === "ATTENDANCE_MANAGER"
      ? "bg-teal-100 text-teal-800"
      : "bg-blue-100 text-blue-700";
  const others = (roles || []).filter((r) => r !== role);
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${tone(role)}`}>{roleLabel(role)}</span>
      {others.map((r) => (
        <span key={r} className={`px-2 py-0.5 rounded text-[11px] font-semibold border border-dashed ${tone(r)}`}>
          + {roleLabel(r)}
        </span>
      ))}
      {typeof customCount === "number" && (
        <span
          className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200"
          title="Permissions chosen individually by a Super Admin"
        >
          Custom access · {customCount}
        </span>
      )}
    </span>
  );
}

interface PrimaryRoleSelectProps {
  value: string;
  onChange: (value: string) => void;
}

export function PrimaryRoleSelect({ value, onChange }: PrimaryRoleSelectProps) {
  return (
    <SearchSelect
      value={value}
      onChange={(v) => onChange(v)}
      placeholder="Type to search"
      options={[...PRIMARY_ROLE_OPTIONS.map((o) => ({ value: o.value, label: `${o.label}` }))]}
      className="w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500 font-medium"
    />
  );
}

interface PermissionMatrixProps {
  role: string;
  selected: string[];
  onChange: (codes: string[]) => void;
}

/** Grouped checklist of everything a member can be allowed to open and do. */
export function PermissionMatrix({ role, selected, onChange }: PermissionMatrixProps) {
  if (role === "SUPER_ADMIN") {
    return (
      <div className="p-3 bg-purple-50 border border-purple-100 rounded text-xs text-purple-800">
        A Super Admin automatically has every permission, including user and permission management.
      </div>
    );
  }

  const toggle = (code: string) =>
    onChange(selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]);

  return (
    <div className="space-y-2">
      <div>
        <label className="font-semibold text-slate-700">Permissions</label>
        <p className="text-[11px] text-slate-500">
          Choosing a role fills in its usual permissions. Tick or untick anything to give this member exactly the access you want.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {PERMISSION_GROUPS.map((group) => {
          const assignable = group.permissions.filter((p) => !p.superAdminOnly);
          const allOn = assignable.length > 0 && assignable.every((p) => selected.includes(p.code));
          const setGroup = (on: boolean) => {
            const codes = assignable.map((p) => p.code);
            onChange(on ? Array.from(new Set([...selected, ...codes])) : selected.filter((c) => !codes.includes(c)));
          };
          return (
            <div key={group.key} className="border border-slate-200 rounded-lg p-3 bg-white">
              <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-100">
                <h4 className="text-xs font-bold text-slate-900">{group.title}</h4>
                {assignable.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setGroup(!allOn)}
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-800"
                  >
                    {allOn ? "Deselect All" : "Select All"}
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {group.permissions.map((p) => {
                  const locked = !!p.superAdminOnly;
                  return (
                    <label
                      key={p.code}
                      className={`flex items-start gap-2 ${locked ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                    >
                      <input
                        type="checkbox"
                        checked={!locked && selected.includes(p.code)}
                        disabled={locked}
                        onChange={() => toggle(p.code)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold text-slate-800">{p.label}</span>
                        <span className="block text-[11px] text-slate-500">{p.help}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
