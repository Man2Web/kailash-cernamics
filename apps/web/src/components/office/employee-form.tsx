"use client";

import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { EMPLOYEE_STATUSES, employeeCreateSchema, labelOf } from "@gc/shared";
import { PageHeader, Section } from "@/components/common/page-header";
import { FormGrid, SelectField, SwitchField, TextField } from "@/components/common/form-fields";
import { Button } from "@/components/ui/button";
import { api, ApiError, useApi, useApiMutation } from "@/lib/api";
import { useFormKeys } from "@/hooks/use-form-keys";
import { useSession } from "@/lib/session";

export interface EmployeeRow {
  id: string;
  employeeNo: string;
  name: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  jobTitle: string | null;
  status: string;
  branchId: string | null;
  joiningDate: string;
  branch: { id: string; code: string; name: string } | null;
  user: { id: string; email: string; isActive: boolean; role: { id: string; code: string; name: string } } | null;
}

// Creating a login alongside the employee needs a role and a password; the schema enforces that here so the
// form shows the message next to the right field before anything is sent.
const formSchema = employeeCreateSchema
  .omit({ userId: true })
  .extend({ createLogin: z.boolean(), roleId: z.string().optional(), password: z.string().optional() })
  .superRefine((v, ctx) => {
    if (!v.createLogin) return;
    if (!v.email) ctx.addIssue({ code: "custom", path: ["email"], message: "Email is the login name" });
    if (!v.roleId) ctx.addIssue({ code: "custom", path: ["roleId"], message: "Choose a role" });
    if (!v.password || v.password.length < 8) ctx.addIssue({ code: "custom", path: ["password"], message: "At least 8 characters" });
  });
type Values = z.input<typeof formSchema>;

const toDateInput = (iso?: string) => (iso ? iso.slice(0, 10) : new Date().toISOString().slice(0, 10));

export function EmployeeForm({ employee }: { employee?: EmployeeRow }) {
  const router = useRouter();
  const { can } = useSession();
  const editing = !!employee;
  const branches = useApi<{ items: { id: string; code: string; name: string }[] }>("/branches", { pageSize: 100 });
  const roles = useApi<{ items: { id: string; name: string; code: string }[] }>(can("user.read") ? "/roles" : null, { pageSize: 100 });
  const canLogin = !editing && can("user.write");

  const form = useForm<Values>({
    resolver: zodResolver(formSchema) as unknown as Resolver<Values>,
    defaultValues: employee
      ? {
          employeeNo: employee.employeeNo,
          name: employee.name,
          email: employee.email ?? "",
          phone: employee.phone ?? "",
          department: employee.department ?? "",
          jobTitle: employee.jobTitle ?? "",
          branchId: employee.branchId ?? "",
          joiningDate: toDateInput(employee.joiningDate) as unknown as Date,
          status: employee.status as (typeof EMPLOYEE_STATUSES)[number],
          createLogin: false,
        }
      : { employeeNo: "", name: "", email: "", phone: "", department: "", jobTitle: "", branchId: "", joiningDate: toDateInput() as unknown as Date, status: "ACTIVE", createLogin: canLogin, roleId: "", password: "" },
  });
  const createLogin = form.watch("createLogin");

  const save = useApiMutation((v: Values) => {
    const { createLogin: login, roleId, password, ...rest } = v;
    const body = { ...rest, branchId: rest.branchId || null, email: rest.email || null, phone: rest.phone || null };
    if (editing) return api(`/employees/${employee!.id}`, { method: "PATCH", body });
    if (login) return api("/employees/with-login", { method: "POST", body: { ...body, roleId, password, branchIds: body.branchId ? [body.branchId] : [] } });
    return api("/employees", { method: "POST", body });
  }, ["/employees", "/users", "/attendance"]);

  const submit = form.handleSubmit((v) =>
    save.mutate(v, {
      onSuccess: () => {
        toast.success(editing ? "Employee updated" : "Employee created");
        router.replace("/office/employees");
      },
      onError: (e: ApiError) => {
        e.issues?.forEach((i) => form.setError(i.path as never, { message: i.message }));
        toast.error(e.message);
      },
    }),
  );
  const ref = useFormKeys<HTMLFormElement>(() => submit());
  const readOnly = !can("employee.write");

  return (
    <>
      <PageHeader
        title={editing ? employee!.name : "New employee"}
        description={editing ? `${employee!.employeeNo} · attendance and login details` : "Add a staff member. Give them a login so they can check in with their own phone."}
        back={{ href: "/office/employees", label: "Employees" }}
        actions={
          !readOnly && (
            <Button type="submit" form="employee-form" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          )
        }
      />
      <form id="employee-form" ref={ref} onSubmit={submit} className="max-w-4xl space-y-4">
        <Section title="1. Employee details">
          <FormGrid>
            <TextField control={form.control} name="name" label="Full name" required autoFocus />
            <TextField control={form.control} name="employeeNo" label="Employee ID" required placeholder="e.g. KC-014" />
            <TextField control={form.control} name="phone" label="Mobile" type="tel" />
            <TextField control={form.control} name="jobTitle" label="Job title" placeholder="e.g. Sales executive" />
            <TextField control={form.control} name="department" label="Department" placeholder="e.g. Sales, Godown, Accounts" />
            <SelectField
              control={form.control}
              name="branchId"
              label="Branch"
              allowEmpty="All branches"
              options={(branches.data?.items ?? []).map((b) => ({ value: b.id, label: `${b.code} · ${b.name}` }))}
            />
            <TextField control={form.control} name="joiningDate" label="Joining date" type="date" />
            <SelectField control={form.control} name="status" label="Status" options={EMPLOYEE_STATUSES.map((s) => ({ value: s, label: labelOf(s) }))} />
          </FormGrid>
        </Section>

        <Section title="2. Login">
          {editing ? (
            employee!.user ? (
              <div className="space-y-1 text-[13.5px]">
                <div>
                  Signs in as <span className="font-medium">{employee!.user.email}</span> · {employee!.user.role.name}
                </div>
                <div className="text-muted-foreground">
                  They check in by scanning the attendance screen with their own account. Change the role or password under Settings → Users.
                </div>
              </div>
            ) : (
              <p className="text-[13.5px] text-muted-foreground">This employee has no login, so they cannot check in themselves. Attendance can still be marked by the office.</p>
            )
          ) : canLogin ? (
            <div className="space-y-4">
              <SwitchField control={form.control} name="createLogin" label="Create a login for this employee" />
              {createLogin && (
                <FormGrid>
                  <TextField control={form.control} name="email" label="Email (login name)" type="email" required />
                  <SelectField
                    control={form.control}
                    name="roleId"
                    label="Role"
                    required
                    options={(roles.data?.items ?? []).filter((r) => r.code !== "ATTENDANCE_DISPLAY").map((r) => ({ value: r.id, label: r.name }))}
                  />
                  <TextField control={form.control} name="password" label="Password" type="password" required hint="At least 8 characters. They can change it after signing in." />
                </FormGrid>
              )}
            </div>
          ) : (
            <p className="text-[13.5px] text-muted-foreground">You can add the employee record. A login needs the user-management permission.</p>
          )}
        </Section>
      </form>
    </>
  );
}
