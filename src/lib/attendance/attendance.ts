import db from "@/lib/db/db";
import { randomUUID } from "crypto";
import { withAdvisoryLock } from "@/lib/db/locks";

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  phone: string;
  role: string;
  attendanceDate: string; // YYYY-MM-DD
  checkInTime: string; // e.g. "09:02 AM" or ISO
  checkInISO?: string;
  checkOutTime?: string | null; // e.g. "06:12 PM"
  checkOutISO?: string | null;
  workingMinutes?: number;
  workingHoursFormatted?: string;
  status: "PRESENT" | "LATE" | "HALF_DAY" | "ABSENT" | "LEAVE";
  method: "QR" | "MANUAL";
  updatedBy?: string | null;
  updatedAt?: string | null;
  correctionReason?: string | null;
}

export interface MonthlyEmployeeSummary {
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  role: string;
  workingDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  halfDays: number;
  leaveDays: number;
  totalWorkingMinutes: number;
  totalWorkingHours: string;
}

/**
 * Normalize Indian & international phone numbers for consistent comparison.
 * Extracts digits and handles +91, 91, 0 prefixes to match on the 10-digit mobile number.
 */
export function normalizePhoneNumber(raw?: string | null): string {
  if (!raw) return "";
  const digitsOnly = String(raw).replace(/\D/g, "");
  if (digitsOnly.length === 12 && digitsOnly.startsWith("91")) {
    return digitsOnly.slice(2);
  }
  if (digitsOnly.length === 11 && digitsOnly.startsWith("0")) {
    return digitsOnly.slice(1);
  }
  if (digitsOnly.length >= 10) {
    return digitsOnly.slice(-10);
  }
  return digitsOnly;
}

/**
 * Returns YYYY-MM-DD for Asia/Kolkata (Indian Standard Time)
 */
export function getTodayDateStrIST(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Formats time in 12-hour AM/PM format for Asia/Kolkata (IST)
 */
export function formatTimeTo12HourIST(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

/**
 * Returns hour and minute in Asia/Kolkata (IST)
 */
export function getISTTimeParts(date: Date = new Date()): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(date);

  const hour = Number(parts.find((p) => p.type === "hour")?.value || "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value || "0");
  return { hour, minute };
}

/**
 * Fetch all raw attendance records stored in activity_logs
 */
async function fetchAllAttendanceLogs(): Promise<AttendanceRecord[]> {
  try {
    const data = await db.activityLog.findMany({
      where: { module: "ATTENDANCE" },
      orderBy: { timestamp: "desc" },
    });

    const records: AttendanceRecord[] = [];
    for (const row of data) {
      if (!row.description) continue;
      try {
        const meta = JSON.parse(row.description);
        records.push({
          id: row.id,
          employeeId: meta.employeeId || "",
          employeeNo: meta.employeeNo || "",
          employeeName: meta.employeeName || "Employee",
          phone: meta.phone || "",
          role: meta.role || "STAFF",
          attendanceDate: meta.attendanceDate || "",
          checkInTime: meta.checkInTime || "-",
          checkInISO: meta.checkInISO,
          checkOutTime: meta.checkOutTime || null,
          checkOutISO: meta.checkOutISO || null,
          workingMinutes: Number(meta.workingMinutes || 0),
          workingHoursFormatted: meta.workingHoursFormatted || "-",
          status: meta.status || "PRESENT",
          method: meta.method || "QR",
          updatedBy: meta.updatedBy,
          updatedAt: meta.updatedAt,
          correctionReason: meta.correctionReason,
        });
      } catch {
        // Skip invalid JSON
      }
    }
    return records;
  } catch (err) {
    console.error("Error fetching attendance logs:", err);
    return [];
  }
}

/**
 * Check In an Employee via QR or Manual
 */
export async function markEmployeeCheckIn({
  identifier,
  method = "QR",
}: {
  identifier: string;
  method?: "QR" | "MANUAL";
}): Promise<{
  success: boolean;
  message: string;
  alreadyCheckedIn?: boolean;
  record?: AttendanceRecord;
}> {
  try {
    const rawClean = (identifier || "").trim();
    if (!rawClean) {
      return { success: false, message: "Please enter your mobile number." };
    }

    const cleanLower = rawClean.toLowerCase();
    const normalizedInputPhone = normalizePhoneNumber(rawClean);

    // 1. Find employee in database
    const employees = await db.employee.findMany();
    const matchedEmployee = employees.find((e: any) => {
      // 1. Direct employeeNo match
      if (e.employeeNo && e.employeeNo.trim().toLowerCase() === cleanLower) return true;
      // 2. Direct ID match
      if (e.id && e.id.toLowerCase() === cleanLower) return true;
      // 3. Direct Email match
      if (e.email && e.email.trim().toLowerCase() === cleanLower) return true;
      // 4. Exact raw phone match
      if (e.phone && e.phone.trim().toLowerCase() === cleanLower) return true;
      // 5. Normalized 10-digit mobile match
      if (normalizedInputPhone.length >= 10 && e.phone) {
        const empNormPhone = normalizePhoneNumber(e.phone);
        if (empNormPhone && (empNormPhone === normalizedInputPhone || empNormPhone.endsWith(normalizedInputPhone) || normalizedInputPhone.endsWith(empNormPhone))) {
          return true;
        }
      }
      return false;
    });

    if (!matchedEmployee) {
      return {
        success: false,
        message: "Mobile number is not registered",
      };
    }

    if (matchedEmployee.status === "INACTIVE" || matchedEmployee.status === "TERMINATED" || matchedEmployee.status === "SUSPENDED") {
      return {
        success: false,
        message: "This employee account is inactive. Please contact administration.",
      };
    }

    // 2. Fetch User & Role details
    const users = await db.user.findMany({
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
      },
    });

    const matchedUser = users.find(
      (u: any) =>
        u.email?.toLowerCase() === matchedEmployee.email?.toLowerCase() ||
        u.name?.toLowerCase() === matchedEmployee.name?.toLowerCase()
    );
    const roleName =
      matchedUser?.userRoles?.[0]?.role?.name ||
      matchedEmployee.jobTitle ||
      matchedEmployee.department ||
      "EMPLOYEE";

    // 3. Check for existing attendance record for today (Duplicate Protection)
    const todayStr = getTodayDateStrIST();
    return await withAdvisoryLock(`attendance:${matchedEmployee.id}:${todayStr}`, async () => {
    const allRecords = await fetchAllAttendanceLogs();
    const existing = allRecords.find(
      (r) =>
        (r.employeeId === matchedEmployee.id || r.employeeNo === matchedEmployee.employeeNo) &&
        r.attendanceDate === todayStr
    );

    if (existing) {
      if (existing.checkOutTime) {
        return {
          success: false,
          alreadyCheckedIn: true,
          message: "Attendance completed for today.",
          record: existing,
        };
      }
      return {
        success: false,
        alreadyCheckedIn: true,
        message: "Already checked in today. Please check out when your shift ends.",
        record: existing,
      };
    }

    // 4. Determine status in IST: Standard check-in threshold is 9:15 AM
    const now = new Date();
    const checkInTimeFormatted = formatTimeTo12HourIST(now);
    const checkInISO = now.toISOString();

    const { hour: checkInHour, minute: checkInMinute } = getISTTimeParts(now);
    const isLate = checkInHour > 9 || (checkInHour === 9 && checkInMinute > 15);
    const status = isLate ? "LATE" : "PRESENT";

    const recordId = randomUUID();
    const payload: AttendanceRecord = {
      id: recordId,
      employeeId: matchedEmployee.id,
      employeeNo: matchedEmployee.employeeNo,
      employeeName: matchedEmployee.name,
      phone: matchedEmployee.phone || "",
      role: roleName,
      attendanceDate: todayStr,
      checkInTime: checkInTimeFormatted,
      checkInISO,
      checkOutTime: null,
      checkOutISO: null,
      workingMinutes: 0,
      workingHoursFormatted: "-",
      status,
      method,
    };

    // 5. Store in activity_logs
    await db.activityLog.create({
      data: {
        id: recordId,
        userId: matchedUser?.id || null,
        module: "ATTENDANCE",
        description: JSON.stringify(payload),
      },
    });

    return {
      success: true,
      message: "Check-in marked successfully",
      record: payload,
    };
    });
  } catch (error: any) {
    console.error("Error in markEmployeeCheckIn:", error);
    return { success: false, message: error.message || "Failed to mark attendance." };
  }
}

/**
 * Check Out an Employee via QR or Manual
 */
export async function markEmployeeCheckOut({
  identifier,
}: {
  identifier: string;
}): Promise<{
  success: boolean;
  message: string;
  record?: AttendanceRecord;
}> {
  try {
    const rawClean = (identifier || "").trim();
    if (!rawClean) {
      return { success: false, message: "Please enter your mobile number." };
    }

    const cleanLower = rawClean.toLowerCase();
    const normalizedInputPhone = normalizePhoneNumber(rawClean);

    // 1. Find employee
    const employees = await db.employee.findMany();
    const matchedEmployee = employees.find((e: any) => {
      if (e.employeeNo && e.employeeNo.trim().toLowerCase() === cleanLower) return true;
      if (e.id && e.id.toLowerCase() === cleanLower) return true;
      if (e.email && e.email.trim().toLowerCase() === cleanLower) return true;
      if (e.phone && e.phone.trim().toLowerCase() === cleanLower) return true;
      if (normalizedInputPhone.length >= 10 && e.phone) {
        const empNormPhone = normalizePhoneNumber(e.phone);
        if (empNormPhone && (empNormPhone === normalizedInputPhone || empNormPhone.endsWith(normalizedInputPhone) || normalizedInputPhone.endsWith(empNormPhone))) {
          return true;
        }
      }
      return false;
    });

    if (!matchedEmployee) {
      return {
        success: false,
        message: "Mobile number is not registered",
      };
    }

    // 2. Find today's check-in record
    const todayStr = getTodayDateStrIST();
    const allRecords = await fetchAllAttendanceLogs();
    const existing = allRecords.find(
      (r) =>
        (r.employeeId === matchedEmployee.id || r.employeeNo === matchedEmployee.employeeNo) &&
        r.attendanceDate === todayStr
    );

    if (!existing) {
      return {
        success: false,
        message: "No check-in record found for today. Please check in first.",
      };
    }

    if (existing.checkOutTime) {
      return {
        success: false,
        message: "Attendance completed for today.",
        record: existing,
      };
    }

    // 3. Compute working duration in IST
    const now = new Date();
    const checkOutTimeFormatted = formatTimeTo12HourIST(now);
    const checkOutISO = now.toISOString();

    let workingMinutes = 0;
    if (existing.checkInISO) {
      const checkInDate = new Date(existing.checkInISO);
      const diffMs = now.getTime() - checkInDate.getTime();
      workingMinutes = Math.max(0, Math.round(diffMs / (1000 * 60)));
    }

    const hours = Math.floor(workingMinutes / 60);
    const mins = workingMinutes % 60;
    const workingHoursFormatted = `${hours}h ${mins}m`;

    const updatedPayload: AttendanceRecord = {
      ...existing,
      checkOutTime: checkOutTimeFormatted,
      checkOutISO,
      workingMinutes,
      workingHoursFormatted,
    };

    // 4. Update in database
    await db.activityLog.update({
      where: { id: existing.id },
      data: { description: JSON.stringify(updatedPayload) },
    });

    return {
      success: true,
      message: `Checked out successfully at ${checkOutTimeFormatted}. Working duration: ${workingHoursFormatted}`,
      record: updatedPayload,
    };
  } catch (error: any) {
    console.error("Error in markEmployeeCheckOut:", error);
    return { success: false, message: error.message || "Failed to check out." };
  }
}

/**
 * Get Today's attendance status for an employee (Not Checked In, Checked In, or Completed)
 */
export async function getEmployeeTodayAttendanceStatus(identifier: string): Promise<{
  success: boolean;
  message?: string;
  employee?: {
    id: string;
    employeeNo: string;
    name: string;
    phone?: string;
    role: string;
  };
  record?: AttendanceRecord | null;
  state: "NOT_CHECKED_IN" | "CHECKED_IN" | "COMPLETED";
}> {
  try {
    const rawClean = (identifier || "").trim();
    if (!rawClean) {
      return { success: false, state: "NOT_CHECKED_IN", message: "Please enter your mobile number." };
    }

    const cleanLower = rawClean.toLowerCase();
    const normalizedInputPhone = normalizePhoneNumber(rawClean);

    const employees = await db.employee.findMany();
    const matchedEmployee = employees.find((e: any) => {
      if (e.employeeNo && e.employeeNo.trim().toLowerCase() === cleanLower) return true;
      if (e.id && e.id.toLowerCase() === cleanLower) return true;
      if (e.email && e.email.trim().toLowerCase() === cleanLower) return true;
      if (e.phone && e.phone.trim().toLowerCase() === cleanLower) return true;
      if (normalizedInputPhone.length >= 10 && e.phone) {
        const empNormPhone = normalizePhoneNumber(e.phone);
        if (empNormPhone && (empNormPhone === normalizedInputPhone || empNormPhone.endsWith(normalizedInputPhone) || normalizedInputPhone.endsWith(empNormPhone))) {
          return true;
        }
      }
      return false;
    });

    if (!matchedEmployee) {
      return { success: false, state: "NOT_CHECKED_IN", message: "Mobile number is not registered." };
    }

    const todayStr = getTodayDateStrIST();
    const allRecords = await fetchAllAttendanceLogs();
    const existing = allRecords.find(
      (r) =>
        (r.employeeId === matchedEmployee.id || r.employeeNo === matchedEmployee.employeeNo) &&
        r.attendanceDate === todayStr
    );

    const empData = {
      id: matchedEmployee.id,
      employeeNo: matchedEmployee.employeeNo,
      name: matchedEmployee.name,
      phone: matchedEmployee.phone || "",
      role: matchedEmployee.jobTitle || matchedEmployee.department || "Employee",
    };

    if (!existing) {
      return {
        success: true,
        employee: empData,
        record: null,
        state: "NOT_CHECKED_IN",
      };
    }

    if (existing.checkOutTime) {
      return {
        success: true,
        employee: empData,
        record: existing,
        state: "COMPLETED",
      };
    }

    return {
      success: true,
      employee: empData,
      record: existing,
      state: "CHECKED_IN",
    };
  } catch (err: any) {
    console.error("Error fetching employee attendance status:", err);
    return { success: false, state: "NOT_CHECKED_IN", message: err.message };
  }
}

/**
 * Get Today's attendance summary and records for Super Admin
 */
export async function getTodayAttendanceSummary(): Promise<{
  totalEmployees: number;
  presentCount: number;
  checkedInCount: number;
  checkedOutCount: number;
  lateCount: number;
  absentCount: number;
  records: AttendanceRecord[];
}> {
  const employees = await db.employee.findMany();
  const activeEmployees = employees.filter((e: any) => e.status !== "TERMINATED");
  const totalEmployees = activeEmployees.length;

  const todayStr = getTodayDateStrIST();
  const allLogs = await fetchAllAttendanceLogs();
  const todayLogs = allLogs.filter((r) => r.attendanceDate === todayStr);

  const presentCount = todayLogs.filter(
    (r) => r.status === "PRESENT" || r.status === "LATE" || r.status === "HALF_DAY"
  ).length;
  const checkedInCount = todayLogs.filter((r) => !r.checkOutTime).length;
  const checkedOutCount = todayLogs.filter((r) => Boolean(r.checkOutTime)).length;
  const lateCount = todayLogs.filter((r) => r.status === "LATE").length;
  const absentCount = Math.max(0, totalEmployees - presentCount);

  return {
    totalEmployees,
    presentCount,
    checkedInCount,
    checkedOutCount,
    lateCount,
    absentCount,
    records: todayLogs,
  };
}

/**
 * Get Monthly Attendance Data and Employee Statistics for Super Admin
 */
export async function getMonthlyAttendanceData(
  year: number,
  month: number
): Promise<{
  dailyRecords: AttendanceRecord[];
  employeeSummaries: MonthlyEmployeeSummary[];
}> {
  const monthStr = String(month).padStart(2, "0");
  const prefix = `${year}-${monthStr}`;

  const allLogs = await fetchAllAttendanceLogs();
  const monthLogs = allLogs.filter((r) => r.attendanceDate.startsWith(prefix));

  // Fetch employees
  const employees = await db.employee.findMany();
  const activeEmployees = employees.filter((e: any) => e.status !== "TERMINATED");

  // Calculate days in month
  const daysInMonth = new Date(year, month, 0).getDate();
  const workingDays = Math.min(26, daysInMonth); // standard working days estimate

  const employeeSummaries: MonthlyEmployeeSummary[] = activeEmployees.map((emp: any) => {
    const empLogs = monthLogs.filter(
      (r) => r.employeeId === emp.id || r.employeeNo === emp.employeeNo
    );

    let presentDays = 0;
    let lateDays = 0;
    let halfDays = 0;
    let leaveDays = 0;
    let totalMinutes = 0;

    for (const log of empLogs) {
      if (log.status === "PRESENT") presentDays++;
      else if (log.status === "LATE") {
        presentDays++;
        lateDays++;
      } else if (log.status === "HALF_DAY") halfDays++;
      else if (log.status === "LEAVE") leaveDays++;

      totalMinutes += log.workingMinutes || 0;
    }

    const absentDays = Math.max(0, workingDays - (presentDays + halfDays + leaveDays));
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const totalWorkingHours = `${hours}h ${mins}m`;

    return {
      employeeId: emp.id,
      employeeNo: emp.employeeNo,
      employeeName: emp.name,
      role: emp.jobTitle || emp.department || "Staff",
      workingDays,
      presentDays,
      absentDays,
      lateDays,
      halfDays,
      leaveDays,
      totalWorkingMinutes: totalMinutes,
      totalWorkingHours,
    };
  });

  return {
    dailyRecords: monthLogs,
    employeeSummaries,
  };
}

/**
 * Super Admin manual attendance correction
 */
export async function correctEmployeeAttendance({
  recordId,
  employeeId,
  attendanceDate,
  checkInTime,
  checkOutTime,
  status,
  reason,
  updatedBy,
}: {
  recordId?: string;
  employeeId: string;
  attendanceDate: string;
  checkInTime: string;
  checkOutTime?: string;
  status: "PRESENT" | "LATE" | "HALF_DAY" | "ABSENT" | "LEAVE";
  reason: string;
  updatedBy: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    const employees = await db.employee.findMany();
    const emp = employees.find((e: any) => e.id === employeeId || e.employeeNo === employeeId);
    if (!emp) {
      return { success: false, message: "Employee not found." };
    }

    const now = new Date();
    const id = recordId || randomUUID();

    const payload: AttendanceRecord = {
      id,
      employeeId: emp.id,
      employeeNo: emp.employeeNo,
      employeeName: emp.name,
      phone: emp.phone || "",
      role: emp.jobTitle || emp.department || "Staff",
      attendanceDate,
      checkInTime,
      checkOutTime: checkOutTime || null,
      status,
      method: "MANUAL",
      updatedBy,
      updatedAt: now.toISOString(),
      correctionReason: reason,
    };

    if (recordId) {
      await db.activityLog.update({
        where: { id: recordId },
        data: { description: JSON.stringify(payload) },
      });
    } else {
      await db.activityLog.create({
        data: {
          id,
          userId: null,
          module: "ATTENDANCE",
          description: JSON.stringify(payload),
        },
      });
    }

    return { success: true, message: "Attendance correction saved successfully." };
  } catch (error: any) {
    console.error("Error in correctEmployeeAttendance:", error);
    return { success: false, message: error.message || "Failed to save correction." };
  }
}
