import React from "react";
import db from "@/lib/db/db";
import { getSession, canManageAttendance } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import AttendanceAdminClient from "@/components/erp/AttendanceAdminClient";
import { getTodayAttendanceSummary, getMonthlyAttendanceData } from "@/lib/attendance/attendance";

export const metadata = {
  title: "Employee Attendance | Super Admin",
  description: "Manage employee check-ins, monthly attendance tracking, and Excel exports.",
};

export default async function AttendanceAdminPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Strict Super Admin RBAC Check
  const isSuperAdmin = canManageAttendance(session.user.roles); // Super Admin or Attendance Manager
  if (!isSuperAdmin) {
    redirect("/unauthorized");
  }

  // 1. Fetch Today's Attendance Summary
  const todaySummary = await getTodayAttendanceSummary();

  // 2. Fetch Current Month Attendance Summary
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthData = await getMonthlyAttendanceData(year, month);

  // 3. Fetch Employees for selection in manual correction modal
  const dbEmployees = await db.employee.findMany({
    where: {
      status: "ACTIVE",
    },
    orderBy: {
      name: "asc",
    },
  });

  const formattedEmployees = dbEmployees.map((e: any) => ({
    id: e.id,
    employeeNo: e.employeeNo,
    name: e.name,
    role: e.jobTitle || e.department || "Employee",
  }));

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  return (
    <AttendanceAdminClient
      initialTodaySummary={todaySummary}
      initialMonthData={monthData}
      employees={formattedEmployees}
      appUrl={appUrl}
    />
  );
}
