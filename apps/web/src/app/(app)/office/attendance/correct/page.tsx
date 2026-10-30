"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { ATTENDANCE_STATUSES, attendanceCorrectionSchema, labelOf } from "@gc/shared";
import { PageHeader, Section } from "@/components/common/page-header";
import { ErrorState, LoadingPage } from "@/components/common/states";
import { FormGrid, SelectField, TextField, TextareaField } from "@/components/common/form-fields";
import { Button } from "@/components/ui/button";
import { api, ApiError, useApi, useApiMutation } from "@/lib/api";
import { useFormKeys } from "@/hooks/use-form-keys";

type Values = z.infer<typeof attendanceCorrectionSchema>;

interface Emp {
  id: string;
  name: string;
  employeeNo: string;
}

function CorrectionForm() {
  const router = useRouter();
  const params = useSearchParams();
  const employeeId = params.get("employeeId") ?? "";
  const date = params.get("date") ?? "";
  const emp = useApi<Emp>(employeeId ? `/employees/${employeeId}` : null);

  const form = useForm<Values>({
    resolver: zodResolver(attendanceCorrectionSchema) as Resolver<Values>,
    defaultValues: { employeeId, attendanceDate: date, status: "PRESENT", checkIn: "", checkOut: "", reason: "" },
  });
  const status = form.watch("status");
  const needsTimes = status !== "ABSENT" && status !== "LEAVE";

  const save = useApiMutation((v: Values) => api("/attendance/correct", { method: "POST", body: { ...v, checkIn: v.checkIn || null, checkOut: v.checkOut || null } }), ["/attendance"]);
  const submit = form.handleSubmit((v) =>
    save.mutate(v, {
      onSuccess: () => {
        toast.success("Attendance saved");
        router.replace("/office/attendance");
      },
      onError: (e: ApiError) => {
        e.issues?.forEach((i) => form.setError(i.path as never, { message: i.message }));
        toast.error(e.message);
      },
    }),
  );
  const ref = useFormKeys<HTMLFormElement>(() => submit());

  if (!employeeId || !date) return <ErrorState error={new Error("Open this page from the attendance list.")} />;
  if (emp.isLoading) return <LoadingPage />;
  if (emp.isError) return <ErrorState error={emp.error} retry={() => emp.refetch()} />;

  return (
    <>
      <PageHeader
        title="Correct attendance"
        description={`${emp.data!.name} · ${emp.data!.employeeNo} · ${date}`}
        back={{ href: "/office/attendance", label: "Attendance" }}
        actions={
          <Button type="submit" form="attendance-form" disabled={save.isPending}>
            Save
          </Button>
        }
      />
      <form id="attendance-form" ref={ref} onSubmit={submit} className="max-w-3xl space-y-4">
        <Section title="1. Attendance">
          <FormGrid>
            <SelectField control={form.control} name="status" label="Status" required options={ATTENDANCE_STATUSES.map((s) => ({ value: s, label: labelOf(s) }))} />
            <span />
            {needsTimes && <TextField control={form.control} name="checkIn" label="Check-in (India time)" type="time" required />}
            {needsTimes && <TextField control={form.control} name="checkOut" label="Check-out (India time)" type="time" hint="Leave empty if they have not left yet" />}
          </FormGrid>
        </Section>
        <Section title="2. Reason">
          <TextareaField control={form.control} name="reason" label="Why is this being changed?" required rows={3} hint="Recorded in the audit log with your name" />
        </Section>
      </form>
    </>
  );
}

export default function CorrectAttendancePage() {
  return (
    <Suspense fallback={<LoadingPage />}>
      <CorrectionForm />
    </Suspense>
  );
}
