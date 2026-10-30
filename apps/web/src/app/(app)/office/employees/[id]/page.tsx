"use client";

import { use } from "react";
import { ErrorState, LoadingPage } from "@/components/common/states";
import { EmployeeForm, type EmployeeRow } from "@/components/office/employee-form";
import { useApi } from "@/lib/api";

export default function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const q = useApi<EmployeeRow>(`/employees/${id}`);
  if (q.isLoading) return <LoadingPage />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  return <EmployeeForm employee={q.data!} />;
}
