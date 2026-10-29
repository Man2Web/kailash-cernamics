"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import {
  createUserAction,
  updateUserAccessAction,
  resetUserPasswordAction,
  createCustomerAction,
  createSupplierAction,
} from "@/app/(dashboard)/office/actions";
import { PrimaryRoleSelect, PermissionMatrix } from "@/components/erp/AccessFields";
import { presetFor } from "@/lib/auth/permissions";

export interface WarehouseOption {
  id: string;
  name: string;
  code: string;
}

const inputCls = "w-full p-2 border rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none";

/** Back to the Office list, optionally on a tab and with a one-line confirmation. */
function officeUrl(tab: string, msg?: string) {
  return `/office?tab=${tab}${msg ? `&msg=${encodeURIComponent(msg)}` : ""}`;
}

function PageShell({ tab, title, subtitle, children }: { tab: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <Link href={officeUrl(tab)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Office
        </Link>
        <h1 className="mt-2 text-base sm:text-lg lg:text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-blue-600" /> {title}
        </h1>
        {subtitle && <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="pt-4 border-t border-slate-200">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="font-semibold text-slate-700">{label}</label>
      {children}
    </div>
  );
}

function WarehouseSelect({ value, onChange, warehouses }: { value: string; onChange: (v: string) => void; warehouses: WarehouseOption[] }) {
  return (
    <Field label="Assigned Warehouse *">
      <select value={value} onChange={(e) => onChange(e.target.value)} required className={inputCls}>
        <option value="">-- Select Warehouse --</option>
        {warehouses.map((wh) => (
          <option key={wh.id} value={wh.id}>
            {wh.name} ({wh.code})
          </option>
        ))}
      </select>
    </Field>
  );
}

function FormActions({ tab, pending, label, busy }: { tab: string; pending: boolean; label: string; busy: string }) {
  return (
    <div className="pt-4 border-t flex flex-col-reverse sm:flex-row justify-end gap-2">
      <Link href={officeUrl(tab)} className="w-full sm:w-auto px-4 py-2 border rounded text-center text-slate-600 hover:bg-slate-50 font-medium">
        Cancel
      </Link>
      <button
        type="submit"
        disabled={pending}
        className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold disabled:opacity-50"
      >
        {pending ? busy : label}
      </button>
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return msg ? <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded text-xs">{msg}</div> : null;
}

// ---------------------------------------------------------------- new user / employee
export function NewUserForm({ warehouses }: { warehouses: WarehouseOption[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [employeeNo, setEmployeeNo] = useState("");
  const [role, setRole] = useState<"SALES_PERSON" | "WAREHOUSE_MANAGER" | "SUPER_ADMIN" | "ATTENDANCE_DISPLAY">("SALES_PERSON");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [password, setPassword] = useState("Inventory@123");
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE">("ACTIVE");
  const [permissions, setPermissions] = useState<string[]>(presetFor("SALES_PERSON"));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const res = await createUserAction({ name, employeeNo, role, permissions, email, phone, warehouseId, password, status });
      if (res.success) router.push(officeUrl("users", `User ${name} created successfully.`));
      else setError(res.error || "Failed to create user.");
    });
  };

  return (
    <PageShell tab="users" title="Create New User / Employee" subtitle="Set the member's details, role and exactly what they can open and do.">
      <form onSubmit={submit} className="space-y-4 text-xs">
        <Field label="Full Name *">
          <input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ramesh Kumar" className={inputCls} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Role *">
            <select
              value={role}
              onChange={(e) => {
                setRole(e.target.value as typeof role);
                setPermissions(presetFor(e.target.value));
              }}
              className={`${inputCls} font-medium`}
            >
              <option value="SALES_PERSON">Sales Person</option>
              <option value="WAREHOUSE_MANAGER">Warehouse Manager</option>
              <option value="SUPER_ADMIN">Super Admin</option>
              <option value="ATTENDANCE_DISPLAY">Attendance QR Screen (display login)</option>
            </select>
          </Field>
          {role !== "ATTENDANCE_DISPLAY" && (
            <Field label="Employee ID">
              <input type="text" value={employeeNo} onChange={(e) => setEmployeeNo(e.target.value)} placeholder="e.g. EMP-0001" className={inputCls} />
            </Field>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Email Address (Optional if phone provided)">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e.g. ramesh@inventory.com" className={inputCls} />
          </Field>
          <Field label="Phone Number (Optional if email provided)">
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 9876543210" className={inputCls} />
          </Field>
        </div>

        {role === "ATTENDANCE_DISPLAY" ? (
          <div className="p-3 rounded border border-blue-200 bg-blue-50 text-blue-800 text-xs leading-relaxed">
            This is a dedicated login for the office attendance screen. It shows the rotating attendance QR and nothing else: it cannot open
            sales, stock, office or any other page, and it is not a staff member. Neither the Super Admin nor any other account can open that
            QR screen. Use the email or phone below as its username.
          </div>
        ) : (
          <PermissionMatrix role={role} selected={permissions} onChange={setPermissions} />
        )}

        {role === "WAREHOUSE_MANAGER" && <WarehouseSelect value={warehouseId} onChange={setWarehouseId} warehouses={warehouses} />}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Initial Password *">
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className={inputCls} />
          </Field>
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={`${inputCls} font-medium`}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </Field>
        </div>

        <ErrorBox msg={error} />
        <FormActions tab="users" pending={isPending} label="Create User" busy="Creating..." />
      </form>
    </PageShell>
  );
}

// ---------------------------------------------------------------- manage access
export function AccessForm({
  user,
  initialRole,
  initialPermissions,
  initialWarehouseId,
  warehouses,
}: {
  user: { id: string; name: string };
  initialRole: string;
  initialPermissions: string[];
  initialWarehouseId: string;
  warehouses: WarehouseOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [role, setRole] = useState(initialRole);
  const [permissions, setPermissions] = useState<string[]>(initialPermissions);
  const [warehouseId, setWarehouseId] = useState(initialWarehouseId);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const res = await updateUserAccessAction({ userId: user.id, role, permissions, warehouseId: warehouseId || undefined });
      if (res.success) router.push(officeUrl("users", `Access updated for ${user.name}.`));
      else setError(res.error || "Failed to update access.");
    });
  };

  return (
    <PageShell tab="users" title={`Manage access: ${user.name}`} subtitle="Choose the main role and tick exactly what this member may open and do.">
      <form onSubmit={submit} className="space-y-4 text-xs">
        <Field label="Main role *">
          <PrimaryRoleSelect
            value={role}
            onChange={(v) => {
              setRole(v);
              setPermissions(presetFor(v));
            }}
          />
        </Field>
        <PermissionMatrix role={role} selected={permissions} onChange={setPermissions} />
        {role === "WAREHOUSE_MANAGER" && <WarehouseSelect value={warehouseId} onChange={setWarehouseId} warehouses={warehouses} />}
        <p className="text-[11px] text-slate-500">
          Saving replaces this member&apos;s role and permissions with the selection above. It takes effect the next time they open a page.
        </p>
        <ErrorBox msg={error} />
        <FormActions tab="users" pending={isPending} label="Save access" busy="Saving..." />
      </form>
    </PageShell>
  );
}

// ---------------------------------------------------------------- reset password
export function ResetPasswordForm({ user }: { user: { id: string; name: string } }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const res = await resetUserPasswordAction(user.id, password);
      if (res.success) router.push(officeUrl("users", `Password reset successfully for ${user.name}.`));
      else setError(res.error || "Failed to reset password.");
    });
  };

  return (
    <PageShell tab="users" title={`Reset Password for ${user.name}`} subtitle="They will use this password the next time they log in.">
      <form onSubmit={submit} className="space-y-4 text-xs max-w-md">
        <Field label="New Password *">
          <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 6 characters" className={inputCls} />
        </Field>
        <ErrorBox msg={error} />
        <FormActions tab="users" pending={isPending} label="Save Password" busy="Resetting..." />
      </form>
    </PageShell>
  );
}

// ---------------------------------------------------------------- new customer
export function NewCustomerForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [gstin, setGstin] = useState("");
  const [address, setAddress] = useState("");
  const [creditLimit, setCreditLimit] = useState(0);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const res = await createCustomerAction({ name, phone, email, gstin, address, creditLimit: Number(creditLimit) });
      if (res.success) router.push(officeUrl("customers", `Customer ${name} created successfully.`));
      else setError(res.error || "Failed to create customer.");
    });
  };

  return (
    <PageShell tab="customers" title="Add New Customer">
      <form onSubmit={submit} className="space-y-4 text-xs max-w-2xl">
        <Field label="Customer Name *">
          <input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Aditi Tiles & Interiors" className={inputCls} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Phone">
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 9876543210" className={inputCls} />
          </Field>
          <Field label="Email">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e.g. aditi@gmail.com" className={inputCls} />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="GSTIN">
            <input type="text" value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="e.g. 33AABCU9603R1ZM" className={`${inputCls} uppercase`} />
          </Field>
          <Field label="Credit Limit (₹)">
            <input type="number" min={0} value={creditLimit} onChange={(e) => setCreditLimit(Number(e.target.value))} className={inputCls} />
          </Field>
        </div>
        <Field label="Billing Address">
          <textarea value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, City, State, Pincode" rows={2} className={inputCls} />
        </Field>
        <ErrorBox msg={error} />
        <FormActions tab="customers" pending={isPending} label="Save Customer" busy="Saving..." />
      </form>
    </PageShell>
  );
}

// ---------------------------------------------------------------- new supplier
export function NewSupplierForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [gstin, setGstin] = useState("");
  const [address, setAddress] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const res = await createSupplierAction({ name, phone, email, gstin, address });
      if (res.success) router.push(officeUrl("suppliers", `Supplier ${name} created successfully.`));
      else setError(res.error || "Failed to create supplier.");
    });
  };

  return (
    <PageShell tab="suppliers" title="Add New Supplier">
      <form onSubmit={submit} className="space-y-4 text-xs max-w-2xl">
        <Field label="Supplier Name *">
          <input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kajaria Ceramics Ltd" className={inputCls} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Phone">
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 044-24567890" className={inputCls} />
          </Field>
          <Field label="Email">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e.g. vendor@kajaria.com" className={inputCls} />
          </Field>
        </div>
        <Field label="GSTIN">
          <input type="text" value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="e.g. 33AAACK1234F1Z8" className={`${inputCls} uppercase`} />
        </Field>
        <Field label="Address">
          <textarea value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Vendor facility address" rows={2} className={inputCls} />
        </Field>
        <ErrorBox msg={error} />
        <FormActions tab="suppliers" pending={isPending} label="Save Supplier" busy="Saving..." />
      </form>
    </PageShell>
  );
}
