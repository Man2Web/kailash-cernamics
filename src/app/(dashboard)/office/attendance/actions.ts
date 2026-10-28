"use server";

import { getSession, canManageAttendance } from "@/lib/auth/auth";
import {
  getTodayAttendanceSummary,
  getMonthlyAttendanceData,
  correctEmployeeAttendance,
  AttendanceRecord,
  MonthlyEmployeeSummary,
} from "@/lib/attendance/attendance";
import { revalidatePath } from "next/cache";
import ExcelJS from "exceljs";

function checkSuperAdmin(session: any) {
  if (!session) throw new Error("Unauthorized: Please log in.");
  if (!canManageAttendance(session)) {
    throw new Error("Forbidden: Attendance records are restricted to Super Admin and Attendance Manager.");
  }
}

export async function fetchTodayAttendanceAction() {
  const session = await getSession();
  checkSuperAdmin(session);
  return await getTodayAttendanceSummary();
}

export async function fetchMonthlyAttendanceAction(year: number, month: number) {
  const session = await getSession();
  checkSuperAdmin(session);
  return await getMonthlyAttendanceData(year, month);
}

export async function saveAttendanceCorrectionAction(payload: {
  recordId?: string;
  employeeId: string;
  attendanceDate: string;
  checkInTime: string;
  checkOutTime?: string;
  status: "PRESENT" | "LATE" | "HALF_DAY" | "ABSENT" | "LEAVE";
  reason: string;
}) {
  const session = await getSession();
  checkSuperAdmin(session);

  const res = await correctEmployeeAttendance({
    ...payload,
    updatedBy: session.user.name,
  });

  revalidatePath("/office/attendance");
  revalidatePath("/office");
  return res;
}

/**
 * Generate Excel (.xlsx) file with Monthly Summary and Daily Logs
 */
export async function exportAttendanceExcelAction(year: number, month: number): Promise<{
  success: boolean;
  base64?: string;
  filename?: string;
  error?: string;
}> {
  try {
    const session = await getSession();
    checkSuperAdmin(session);

    const { dailyRecords, employeeSummaries } = await getMonthlyAttendanceData(year, month);
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    const monthName = monthNames[month - 1] || `Month-${month}`;
    const filename = `attendance-${monthName.toLowerCase()}-${year}.xlsx`;

    // 1. Prepare Detailed Daily Logs Sheet Data (Sheet 1)
    const dailySheetData = dailyRecords.map((r) => {
      const dateObj = new Date(r.attendanceDate);
      const dayName = !isNaN(dateObj.getTime())
        ? dateObj.toLocaleDateString("en-US", { weekday: "short" })
        : "-";

      return {
        "Employee ID": r.employeeNo,
        "Employee Name": r.employeeName,
        "Role": r.role,
        "Date": r.attendanceDate,
        "Day": dayName,
        "Check In": r.checkInTime,
        "Check Out": r.checkOutTime || "-",
        "Working Hours": r.workingHoursFormatted || "-",
        "Status": r.status,
      };
    });

    // 2. Prepare Monthly Summary Sheet Data (Sheet 2)
    const summarySheetData = employeeSummaries.map((s) => ({
      "Employee ID": s.employeeNo,
      "Employee Name": s.employeeName,
      "Role": s.role,
      "Working Days": s.workingDays,
      "Present": s.presentDays,
      "Absent": s.absentDays,
      "Late": s.lateDays,
      "Half Day": s.halfDays,
      "Leave": s.leaveDays,
      "Total Working Hours": s.totalWorkingHours,
    }));

    // 3. Build XLSX workbook with 2 sheets (write-only; values are written as plain data, never formulas)
    const workbook = new ExcelJS.Workbook();
    const addSheet = (name: string, rows: Record<string, string | number | null | undefined>[]) => {
      const ws = workbook.addWorksheet(name);
      if (rows.length === 0) return;
      const headers = Object.keys(rows[0]);
      ws.columns = headers.map((h) => ({ header: h, key: h, width: Math.max(12, h.length + 2) }));
      rows.forEach((row) => ws.addRow(row));
    };
    addSheet("Daily Attendance", dailySheetData);
    addSheet("Monthly Summary", summarySheetData);

    // 4. Output as base64
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer()).toString("base64");

    return {
      success: true,
      base64: buffer,
      filename,
    };
  } catch (err: any) {
    console.error("Error generating attendance Excel:", err);
    return { success: false, error: err.message || "Failed to generate Excel file." };
  }
}
