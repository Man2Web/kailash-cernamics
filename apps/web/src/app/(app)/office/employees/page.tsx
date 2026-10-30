"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { DataTable } from "@/components/common/data-table";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { EMPLOYEE_STATUSES, labelOf } from "@gc/shared";
import { useSession } from "@/lib/session";
import type { EmployeeRow } from "@/components/office/employee-form";

export default function EmployeesPage() {
  const router = useRouter();
  const { can } = useSession();
  return (
    <>
      <PageHeader
        title="Employees"
        description="Staff records and logins. Employees with a login check in by scanning the attendance screen."
        actions={
          can("employee.write") && (
            <Button asChild>
              <Link href="/office/employees/new">
                <Plus className="size-4" /> New employee
              </Link>
            </Button>
          )
        }
      />
      <DataTable<EmployeeRow>
        endpoint="/employees"
        exportName="employees"
        onRowClick={(e) => router.push(`/office/employees/${e.id}`)}
        filters={[{ key: "status", label: "Status", options: EMPLOYEE_STATUSES.map((s) => ({ value: s, label: labelOf(s) })) }]}
        columns={[
          { accessorKey: "employeeNo", header: "ID", meta: { sortKey: "employeeNo" } },
          { accessorKey: "name", header: "Name", meta: { sortKey: "name" }, cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
          { id: "role", header: "Job", cell: ({ row }) => row.original.jobTitle || row.original.department || "—", meta: { exportValue: (r) => r.jobTitle || r.department || "" } },
          { accessorKey: "phone", header: "Mobile", cell: ({ row }) => row.original.phone || "—" },
          { id: "branch", header: "Branch", cell: ({ row }) => row.original.branch?.code ?? "All", meta: { exportValue: (r) => r.branch?.code ?? "" } },
          { id: "login", header: "Login", cell: ({ row }) => row.original.user?.email ?? "No login", meta: { exportValue: (r) => r.user?.email ?? "" } },
          { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
        ]}
      />
    </>
  );
}
