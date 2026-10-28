"use client";

import React, { useState, useTransition } from "react";
import { UserCircle, Mail, Phone, BadgeCheck, Warehouse, ShieldCheck, CalendarDays, CheckCircle2, AlertCircle } from "lucide-react";
import { updateMyProfileAction } from "@/app/(dashboard)/account/actions";

interface ProfileClientProps {
  profile: {
    name: string;
    email: string;
    phone: string;
    employeeNo: string;
    roles: string[];
    warehouse: string;
    status: string;
    memberSince: string;
    hasEmployeeRecord: boolean;
  };
  access: Array<{ title: string; items: string[] }>;
  fullAccess: boolean;
}

function Detail({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5 min-w-0">
      <Icon className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="text-sm text-slate-900 break-words">{value || "—"}</p>
      </div>
    </div>
  );
}

export default function ProfileClient({ profile, access, fullAccess }: ProfileClientProps) {
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone);
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    startTransition(async () => {
      const res: any = await updateMyProfileAction(name, phone);
      setMsg(res.success ? { ok: true, text: res.message } : { ok: false, text: res.error || "Could not update your profile." });
    });
  };

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-full bg-blue-600 text-white flex items-center justify-center text-lg font-bold uppercase shrink-0">
          {profile.name.charAt(0)}
        </div>
        <div className="min-w-0">
          <h1 className="text-base sm:text-lg lg:text-xl font-bold text-slate-900 tracking-tight">My Profile</h1>
          <p className="text-[11px] sm:text-xs text-slate-500">Your personal details and what you can access in this system.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Personal details (editable) */}
        <form onSubmit={save} className="lg:col-span-3 bg-white border border-slate-200 rounded-lg shadow-xs p-4 sm:p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <UserCircle className="h-4 w-4 text-blue-600" /> Personal details
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Full name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full p-2 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Mobile number</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                placeholder={profile.hasEmployeeRecord ? "e.g. 9876543210" : "Only for staff with an employee record"}
                disabled={!profile.hasEmployeeRecord}
                className="w-full p-2 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 outline-none disabled:bg-slate-50 disabled:text-slate-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-100">
            <Detail icon={Mail} label="Login email (cannot be changed here)" value={profile.email} />
            <Detail icon={BadgeCheck} label="Employee ID" value={profile.employeeNo} />
            <Detail icon={ShieldCheck} label="Role" value={profile.roles.join(", ")} />
            <Detail icon={Warehouse} label="Assigned warehouse" value={profile.warehouse} />
            <Detail icon={Phone} label="Account status" value={profile.status} />
            <Detail icon={CalendarDays} label="Member since" value={profile.memberSince} />
          </div>

          {msg && (
            <div
              className={`flex items-center gap-2 p-2.5 rounded text-xs border ${
                msg.ok ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-rose-50 border-rose-200 text-rose-700"
              }`}
            >
              {msg.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
              <span>{msg.text}</span>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-60"
            >
              {isPending ? "Saving..." : "Save changes"}
            </button>
          </div>
        </form>

        {/* What this member can access */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg shadow-xs p-4 sm:p-5 space-y-3">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-blue-600" /> My access
          </h2>
          {fullAccess ? (
            <p className="text-xs text-slate-600">You are a Super Admin, so you can open and do everything in the system.</p>
          ) : access.length === 0 ? (
            <p className="text-xs text-slate-500">No modules have been enabled for you yet. Please ask a Super Admin.</p>
          ) : (
            <div className="space-y-3">
              {access.map((g) => (
                <div key={g.title}>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">{g.title}</p>
                  <ul className="space-y-0.5">
                    {g.items.map((i) => (
                      <li key={i} className="flex items-center gap-1.5 text-xs text-slate-700">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        {i}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-slate-400 pt-2 border-t border-slate-100">
            Your access is set by a Super Admin. Ask them if you need something added.
          </p>
        </div>
      </div>
    </div>
  );
}
