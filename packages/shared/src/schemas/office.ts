// Zod schemas for the Office module: employees and attendance.
import { z } from "zod";
import { requiredText } from "./common";

export const EMPLOYEE_STATUSES = ["ACTIVE", "INACTIVE", "SUSPENDED", "TERMINATED"] as const;
export const ATTENDANCE_STATUSES = ["PRESENT", "LATE", "HALF_DAY", "ABSENT", "LEAVE"] as const;

const optionalShort = (max = 100) => z.string().trim().max(max).optional().nullable();

const employeeBase = z.object({
  employeeNo: z.string().trim().toUpperCase().min(2, "Employee ID is required").max(30).regex(/^[A-Z0-9\-_/]+$/, "Letters, digits, - _ / only"),
  name: requiredText("Name"),
  email: z.string().trim().toLowerCase().email("Enter a valid email").optional().nullable().or(z.literal("").transform(() => null)),
  phone: z.string().trim().regex(/^[0-9+\-\s]{6,20}$/, "Enter a valid phone number").optional().nullable().or(z.literal("").transform(() => null)),
  department: optionalShort(),
  jobTitle: optionalShort(),
  branchId: z.string().optional().nullable(),
  joiningDate: z.coerce.date().optional(),
  status: z.enum(EMPLOYEE_STATUSES).optional(),
  /** Link to an existing login so the employee can check in with their own account. */
  userId: z.string().optional().nullable(),
});

// Defaults live only on create. A partial update must change just the fields it sends (a default on the update
// schema would silently reset the status of an employee whose login is being linked).
export const employeeCreateSchema = employeeBase.extend({ status: z.enum(EMPLOYEE_STATUSES).default("ACTIVE") });
export const employeeUpdateSchema = employeeBase.partial();

/** Create a login (role + password) together with the employee. */
export const employeeWithLoginSchema = employeeCreateSchema.omit({ userId: true }).extend({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  roleId: z.string().min(1, "Role is required"),
  password: z.string().min(8, "At least 8 characters"),
  branchIds: z.array(z.string()).default([]),
});

export const attendanceCheckSchema = z.object({
  /** Rotating token read from the QR screen. */
  token: z.string().trim().min(10, "Scan the QR code on the attendance screen").max(200),
});

export const attendanceCorrectionSchema = z.object({
  employeeId: z.string().min(1),
  attendanceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  status: z.enum(ATTENDANCE_STATUSES),
  /** HH:mm, 24-hour, India time. Optional for ABSENT / LEAVE. */
  checkIn: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm").optional().nullable(),
  checkOut: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm").optional().nullable(),
  reason: requiredText("Reason for the correction", 300),
});

export const attendanceMonthQuery = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

/** Scan page without a login: the QR token plus the employee ID, email or mobile number. */
export const attendancePublicSchema = z.object({
  token: z.string().trim().min(10, "Scan the QR code on the attendance screen").max(200),
  identifier: z.string().trim().min(3, "Enter your mobile number").max(120),
});

export const attendanceTodayQuery = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").optional() });

export const attendanceVerifySchema = z.object({ token: z.string().trim().max(200) });
