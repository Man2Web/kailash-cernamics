"use client";

import { useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { usersCreateSchema, usersUpdateSchema, formatDateTime } from "@gc/shared";
import type { z } from "zod";
import { PageHeader } from "@/components/common/page-header";
import { DataTable } from "@/components/common/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { FieldShell, FormGrid, SelectField, SwitchField, TextField } from "@/components/common/form-fields";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, ApiError, useApi, useApiMutation } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useFormKeys } from "@/hooks/use-form-keys";
import { Controller } from "react-hook-form";

interface UserRow {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  isActive: boolean;
  roleId: string;
  defaultBranchId: string | null;
  lastLoginAt: string | null;
  totpEnabled: boolean;
  role: { id: string; code: string; name: string };
  branches: { branchId: string; branch: { id: string; code: string; name: string } }[];
}

type FormValues = z.infer<typeof usersCreateSchema>;

function UserDialog({ user, onClose }: { user: UserRow | null; onClose: () => void }) {
  const roles = useApi<{ items: { id: string; name: string }[] }>("/roles", { pageSize: 100 });
  const branches = useApi<{ items: { id: string; code: string; name: string }[] }>("/branches", { pageSize: 100 });
  const schema = user ? usersUpdateSchema : usersCreateSchema;
  const form = useForm<FormValues>({
    resolver: zodResolver(schema as typeof usersCreateSchema) as Resolver<FormValues>,
    defaultValues: user
      ? { email: user.email, name: user.name, phone: user.phone ?? "", roleId: user.roleId, branchIds: user.branches.map((b) => b.branchId), defaultBranchId: user.defaultBranchId, isActive: user.isActive }
      : { email: "", name: "", phone: "", roleId: "", branchIds: [], defaultBranchId: null, isActive: true, password: "" },
  });
  const save = useApiMutation(
    (v: Partial<FormValues>) => (user ? api(`/users/${user.id}`, { method: "PATCH", body: v }) : api("/users", { method: "POST", body: v })),
    ["/users"],
  );
  const submit = form.handleSubmit((v) =>
    save.mutate(v, {
      onSuccess: () => {
        toast.success("User saved");
        onClose();
      },
      onError: (e: ApiError) => {
        e.issues?.forEach((i) => form.setError(i.path as never, { message: i.message }));
        toast.error(e.message);
      },
    }),
  );
  const ref = useFormKeys<HTMLFormElement>(() => submit());
  const [pw, setPw] = useState("");
  const reset = useApiMutation(() => api(`/users/${user!.id}/reset-password`, { method: "POST", body: { password: pw } }), ["/users"]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{user ? "Edit user" : "New user"}</DialogTitle>
        </DialogHeader>
        <form ref={ref} onSubmit={submit} className="space-y-4">
          <FormGrid>
            <TextField control={form.control} name="name" label="Name" required autoFocus />
            <TextField control={form.control} name="email" label="Email" type="email" required />
            <TextField control={form.control} name="phone" label="Phone" type="tel" />
            <SelectField control={form.control} name="roleId" label="Role" required options={(roles.data?.items ?? []).map((r) => ({ value: r.id, label: r.name }))} />
            {!user && <TextField control={form.control} name="password" label="Password" type="password" required hint="At least 8 characters" />}
            <SwitchField control={form.control} name="isActive" label="Active" className="self-end" />
          </FormGrid>
          <Controller
            control={form.control}
            name="branchIds"
            render={({ field, fieldState }) => (
              <FieldShell label="Branch access" error={fieldState.error?.message} hint="Owners see every branch automatically">
                <div className="flex flex-wrap gap-3">
                  {(branches.data?.items ?? []).map((b) => (
                    <label key={b.id} className="flex items-center gap-2 text-[13.5px]">
                      <Checkbox
                        checked={(field.value ?? []).includes(b.id)}
                        onCheckedChange={(c) => field.onChange(c ? [...(field.value ?? []), b.id] : (field.value ?? []).filter((x: string) => x !== b.id))}
                      />
                      {b.code} · {b.name}
                    </label>
                  ))}
                </div>
              </FieldShell>
            )}
          />
          {user && (
            <div className="rounded-lg bg-fill p-3">
              <div className="mb-2 text-[13px] font-medium">Reset password</div>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  placeholder="New password (min 8)"
                  className="h-9 flex-1 rounded-md border border-input bg-transparent px-2.5 text-[14px]"
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pw.length < 8 || reset.isPending}
                  onClick={() => reset.mutate(undefined, { onSuccess: () => { toast.success("Password reset; user signed out everywhere"); setPw(""); }, onError: (e) => toast.error(e.message) })}
                >
                  Reset
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function UsersPage() {
  const { can } = useSession();
  const [editing, setEditing] = useState<UserRow | "new" | null>(null);
  const roles = useApi<{ items: { id: string; name: string }[] }>("/roles", { pageSize: 100 });
  return (
    <>
      <PageHeader
        title="Users"
        description="Staff logins, roles and branch access."
        actions={
          can("user.write") && (
            <Button onClick={() => setEditing("new")}>
              <Plus className="size-4" /> New user
            </Button>
          )
        }
      />
      <DataTable<UserRow>
        endpoint="/users"
        exportName="users"
        onRowClick={can("user.write") ? (u) => setEditing(u) : undefined}
        filters={[
          { key: "roleId", label: "Role", options: (roles.data?.items ?? []).map((r) => ({ value: r.id, label: r.name })) },
          { key: "isActive", label: "Status", options: [{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }] },
        ]}
        columns={[
          { accessorKey: "name", header: "Name", meta: { sortKey: "name" }, cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
          { accessorKey: "email", header: "Email" },
          { id: "role", header: "Role", cell: ({ row }) => row.original.role.name, meta: { exportValue: (r) => r.role.name } },
          { id: "branches", header: "Branches", cell: ({ row }) => row.original.branches.map((b) => b.branch.code).join(", ") || "—", meta: { exportValue: (r) => r.branches.map((b) => b.branch.code).join(", ") } },
          { accessorKey: "totpEnabled", header: "2FA", cell: ({ row }) => (row.original.totpEnabled ? "On" : "Off") },
          { accessorKey: "lastLoginAt", header: "Last login", cell: ({ row }) => formatDateTime(row.original.lastLoginAt) || "Never", meta: { exportValue: (r) => formatDateTime(r.lastLoginAt) } },
          {
            accessorKey: "isActive",
            header: "Status",
            cell: ({ row }) => <StatusBadge status={row.original.isActive ? "POSTED" : "CANCELLED"} label={row.original.isActive ? "Active" : "Disabled"} />,
          },
        ]}
      />
      {editing && <UserDialog user={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
