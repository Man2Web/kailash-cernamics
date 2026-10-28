"use client";

import React, { useState, useTransition } from "react";
import { KeyRound, MonitorSmartphone, AlertTriangle, CheckCircle2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { changeMyPasswordAction, signOutOtherDevicesAction } from "@/app/(dashboard)/account/actions";

interface AccountSettingsClientProps {
  email: string;
  usingDefaultPassword: boolean;
  activeSessions: number;
}

function PasswordField({ label, value, onChange, autoComplete }: { label: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1">
      <label className="font-semibold text-slate-700">{label}</label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          required
          className="w-full p-2 pr-9 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 outline-none"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 px-2.5 text-slate-400 hover:text-slate-700"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function Notice({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return (
    <div
      className={`flex items-center gap-2 p-2.5 rounded text-xs border ${
        msg.ok ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-rose-50 border-rose-200 text-rose-700"
      }`}
    >
      {msg.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
      <span>{msg.text}</span>
    </div>
  );
}

export default function AccountSettingsClient({ email, usingDefaultPassword, activeSessions }: AccountSettingsClientProps) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [devMsg, setDevMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [defaultStillInUse, setDefaultStillInUse] = useState(usingDefaultPassword);

  const changePassword = (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    startTransition(async () => {
      const res: any = await changeMyPasswordAction(current, next, confirm);
      if (res.success) {
        setPwMsg({ ok: true, text: res.message });
        setCurrent("");
        setNext("");
        setConfirm("");
        setDefaultStillInUse(false);
      } else {
        setPwMsg({ ok: false, text: res.error || "Could not change the password." });
      }
    });
  };

  const signOutOthers = () => {
    setDevMsg(null);
    startTransition(async () => {
      const res: any = await signOutOtherDevicesAction();
      setDevMsg(res.success ? { ok: true, text: res.message } : { ok: false, text: res.error || "Could not sign out other devices." });
    });
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-base sm:text-lg lg:text-xl font-bold text-slate-900 tracking-tight">Account Settings</h1>
        <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">Keep your sign-in secure. Signed in as {email}.</p>
      </div>

      {defaultStillInUse && (
        <div className="flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <p>
            <span className="font-bold">You are still using the default password.</span> It is the same for every new member, so please
            choose your own below.
          </p>
        </div>
      )}

      <form onSubmit={changePassword} className="bg-white border border-slate-200 rounded-lg shadow-xs p-4 sm:p-5 space-y-4 text-xs">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-blue-600" /> Change password
        </h2>
        <PasswordField label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <PasswordField label="New password" value={next} onChange={setNext} autoComplete="new-password" />
          <PasswordField label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        </div>
        <p className="text-[11px] text-slate-500">
          At least 8 characters with a letter and a number, and different from your current password. Changing it signs you out on your
          other devices.
        </p>
        <Notice msg={pwMsg} />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-60"
          >
            {isPending ? "Saving..." : "Change password"}
          </button>
        </div>
      </form>

      <div className="bg-white border border-slate-200 rounded-lg shadow-xs p-4 sm:p-5 space-y-3 text-xs">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <MonitorSmartphone className="h-4 w-4 text-blue-600" /> Where you are signed in
        </h2>
        <p className="text-slate-600">
          You are signed in on <span className="font-semibold">{activeSessions}</span> {activeSessions === 1 ? "device" : "devices"} (including this
          one). If you used a shared computer, sign out of the others.
        </p>
        <Notice msg={devMsg} />
        <button
          type="button"
          onClick={signOutOthers}
          disabled={isPending}
          className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded disabled:opacity-60"
        >
          Sign out of other devices
        </button>
      </div>
    </div>
  );
}
