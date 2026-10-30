import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../core/audit.service";
import type { AuthUser } from "../../common/context";
import { stampUpdate } from "../../common/context";
import { verifyAttendanceToken } from "./attendance-token";

const TZ = "Asia/Kolkata";
/** Check-ins after this time (India time) are marked LATE. */
const LATE_AFTER_MINUTES = 9 * 60 + 15;

export function istDate(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function istMinutesOfDay(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "numeric", hour12: false }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  return h * 60 + Number(parts.find((p) => p.type === "minute")?.value ?? 0);
}

/** "2026-10-30" + "09:30" in India time (UTC+5:30, no daylight saving) -> a real instant. */
export function istInstant(date: string, hhmm: string): Date {
  return new Date(`${date}T${hhmm}:00+05:30`);
}

const fmtMinutes = (m: number) => `${Math.floor(m / 60)}h ${m % 60}m`;
const fmtClock = (d: Date) => new Intl.DateTimeFormat("en-IN", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: true }).format(d);

/** Sundays are the weekly off; every other calendar day counts as a working day. */
export function workingDaysInMonth(year: number, month: number): number {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let n = 0;
  for (let d = 1; d <= days; d++) if (new Date(Date.UTC(year, month - 1, d)).getUTCDay() !== 0) n++;
  return n;
}

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Branch scope: everyone sees employees without a branch plus their own branches. */
  private scope(user: AuthUser) {
    return { OR: [{ branchId: null }, { branchId: { in: user.branchIds } }] };
  }

  private async employeeFor(user: AuthUser) {
    const emp = await this.prisma.employee.findFirst({ where: { userId: user.id, deletedAt: null } });
    if (!emp) throw new ForbiddenException("Your login is not linked to an employee record. Ask the office to link it.");
    if (emp.status !== "ACTIVE") throw new ForbiddenException("This employee account is inactive. Please contact administration.");
    return emp;
  }

  private requireToken(token: string) {
    const v = verifyAttendanceToken(token);
    if (!v.valid) throw new BadRequestException(v.message ?? "Invalid QR code.");
  }

  /**
   * Employee typed (or pre-filled) on the scan page: employee ID, email or mobile number. Mobile numbers match on
   * their last 10 digits so +91 / 0 prefixes and spaces do not matter. A number held by two employees matches neither.
   */
  private async employeeByIdentifier(identifier: string) {
    const raw = (identifier || "").trim();
    if (!raw) throw new BadRequestException("Please enter your mobile number.");
    const lower = raw.toLowerCase();
    const digits = raw.replace(/\D/g, "").slice(-10);
    const all = await this.prisma.employee.findMany({ where: { deletedAt: null } });
    const exact = all.filter((e) => e.employeeNo.toLowerCase() === lower || e.id.toLowerCase() === lower || (e.email ?? "").toLowerCase() === lower);
    const byPhone = digits.length >= 10 ? all.filter((e) => (e.phone ?? "").replace(/\D/g, "").slice(-10) === digits) : [];
    const matches = exact.length ? exact : byPhone;
    if (matches.length !== 1) throw new BadRequestException("Mobile number is not registered");
    const emp = matches[0];
    if (emp.status !== "ACTIVE") throw new ForbiddenException("This employee account is inactive. Please contact administration.");
    return emp;
  }

  private stateOf(rec: { checkInAt: Date | null; checkOutAt: Date | null } | null) {
    return !rec || !rec.checkInAt ? "NOT_CHECKED_IN" : rec.checkOutAt ? "COMPLETED" : "CHECKED_IN";
  }

  private shape(r: any) {
    return {
      id: r.id,
      employeeId: r.employeeId,
      attendanceDate: r.attendanceDate,
      checkInAt: r.checkInAt,
      checkOutAt: r.checkOutAt,
      workingMinutes: r.workingMinutes,
      workingHours: r.workingMinutes ? fmtMinutes(r.workingMinutes) : "-",
      status: r.status,
      method: r.method,
      correctionReason: r.correctionReason,
    };
  }

  async myToday(user: AuthUser) {
    const emp = await this.employeeFor(user);
    const rec = await this.prisma.attendanceRecord.findUnique({
      where: { employeeId_attendanceDate: { employeeId: emp.id, attendanceDate: istDate() } },
    });
    const state = !rec ? "NOT_CHECKED_IN" : rec.checkOutAt ? "COMPLETED" : rec.checkInAt ? "CHECKED_IN" : "NOT_CHECKED_IN";
    return { employee: { id: emp.id, employeeNo: emp.employeeNo, name: emp.name }, date: istDate(), state, record: rec ? this.shape(rec) : null };
  }

  /** Signed-in employee scanning the QR: their own linked employee record. */
  async checkIn(user: AuthUser, token: string) {
    this.requireToken(token);
    return this.markIn(await this.employeeFor(user), user.id);
  }

  async checkOut(user: AuthUser, token: string) {
    this.requireToken(token);
    return this.markOut(await this.employeeFor(user), user.id);
  }

  /** Scan page without signing in: the QR token proves they are at the office, the ID / mobile number names the employee. */
  async publicStatus(identifier: string, token: string) {
    this.requireToken(token);
    const emp = await this.employeeByIdentifier(identifier);
    const rec = await this.prisma.attendanceRecord.findUnique({ where: { employeeId_attendanceDate: { employeeId: emp.id, attendanceDate: istDate() } } });
    return { employee: { name: emp.name, employeeNo: emp.employeeNo }, date: istDate(), state: this.stateOf(rec), record: rec ? this.shape(rec) : null };
  }

  async publicCheckIn(identifier: string, token: string) {
    this.requireToken(token);
    return this.markIn(await this.employeeByIdentifier(identifier), null);
  }

  async publicCheckOut(identifier: string, token: string) {
    this.requireToken(token);
    return this.markOut(await this.employeeByIdentifier(identifier), null);
  }

  private async markIn(emp: { id: string; branchId: string | null; name: string }, actorId: string | null) {
    const now = new Date();
    const date = istDate(now);
    const status = istMinutesOfDay(now) > LATE_AFTER_MINUTES ? "LATE" : "PRESENT";
    try {
      const rec = await this.prisma.attendanceRecord.create({
        data: { employeeId: emp.id, attendanceDate: date, checkInAt: now, status, method: "QR", branchId: emp.branchId, createdBy: actorId, updatedBy: actorId },
      });
      return { success: true, message: status === "LATE" ? `Checked in at ${fmtClock(now)} (late).` : `Checked in at ${fmtClock(now)}.`, employeeName: emp.name, record: this.shape(rec) };
    } catch (e: any) {
      // One record per employee per day is enforced by a unique index, so two simultaneous scans cannot both succeed.
      if (e?.code === "P2002") {
        const existing = await this.prisma.attendanceRecord.findUnique({ where: { employeeId_attendanceDate: { employeeId: emp.id, attendanceDate: date } } });
        throw new BadRequestException(existing?.checkOutAt ? "Attendance completed for today." : "Already checked in today. Check out when your shift ends.");
      }
      throw e;
    }
  }

  private async markOut(emp: { id: string; name: string }, actorId: string | null) {
    const now = new Date();
    const date = istDate(now);
    const rec = await this.prisma.attendanceRecord.findUnique({ where: { employeeId_attendanceDate: { employeeId: emp.id, attendanceDate: date } } });
    if (!rec || !rec.checkInAt) throw new BadRequestException("No check-in found for today. Please check in first.");
    if (rec.checkOutAt) throw new BadRequestException("Attendance completed for today.");
    const minutes = Math.max(0, Math.round((now.getTime() - rec.checkInAt.getTime()) / 60000));
    // Only the first check-out wins: the update matches only while the record is still open.
    const res = await this.prisma.attendanceRecord.updateMany({
      where: { id: rec.id, checkOutAt: null },
      data: { checkOutAt: now, workingMinutes: minutes, updatedBy: actorId },
    });
    if (res.count === 0) throw new BadRequestException("Attendance completed for today.");
    const out = await this.prisma.attendanceRecord.findUniqueOrThrow({ where: { id: rec.id } });
    return { success: true, message: `Checked out at ${fmtClock(now)}. Working duration: ${fmtMinutes(minutes)}.`, employeeName: emp.name, record: this.shape(out) };
  }

  /** Everyone expected today with their record, plus the headline counts. */
  async today(user: AuthUser, forDate?: string) {
    const date = forDate && /^\d{4}-\d{2}-\d{2}$/.test(forDate) ? forDate : istDate();
    const employees = await this.prisma.employee.findMany({
      where: { deletedAt: null, status: { not: "TERMINATED" }, ...this.scope(user) },
      orderBy: { name: "asc" },
      include: { attendance: { where: { attendanceDate: date } } },
    });
    const rows = employees.map((e) => {
      const r = e.attendance[0];
      return {
        employeeId: e.id,
        employeeNo: e.employeeNo,
        name: e.name,
        jobTitle: e.jobTitle || e.department || "Staff",
        status: r?.status ?? "NOT_MARKED",
        checkInAt: r?.checkInAt ?? null,
        checkOutAt: r?.checkOutAt ?? null,
        workingHours: r?.workingMinutes ? fmtMinutes(r.workingMinutes) : "-",
        method: r?.method ?? null,
        recordId: r?.id ?? null,
      };
    });
    const present = rows.filter((r) => ["PRESENT", "LATE", "HALF_DAY"].includes(r.status)).length;
    // Most recent check-ins and check-outs first, so the office sees arrivals and departures as they happen.
    const events = rows
      .flatMap((r) => [
        ...(r.checkInAt ? [{ type: "CHECK_IN" as const, at: r.checkInAt, employeeId: r.employeeId, name: r.name, employeeNo: r.employeeNo, status: r.status }] : []),
        ...(r.checkOutAt ? [{ type: "CHECK_OUT" as const, at: r.checkOutAt, employeeId: r.employeeId, name: r.name, employeeNo: r.employeeNo, status: r.status }] : []),
      ])
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, 20);
    return {
      date,
      events,
      summary: {
        total: rows.length,
        present,
        late: rows.filter((r) => r.status === "LATE").length,
        onLeave: rows.filter((r) => r.status === "LEAVE").length,
        notMarked: rows.filter((r) => r.status === "NOT_MARKED").length,
      },
      rows,
    };
  }

  async month(user: AuthUser, year: number, month: number) {
    const prefix = `${year}-${String(month).padStart(2, "0")}`;
    const employees = await this.prisma.employee.findMany({
      where: { deletedAt: null, status: { not: "TERMINATED" }, ...this.scope(user) },
      orderBy: { name: "asc" },
      include: { attendance: { where: { attendanceDate: { startsWith: prefix } }, orderBy: { attendanceDate: "asc" } } },
    });
    const workingDays = workingDaysInMonth(year, month);
    const summaries = employees.map((e) => {
      let present = 0, late = 0, half = 0, leave = 0, minutes = 0;
      for (const r of e.attendance) {
        if (r.status === "PRESENT") present++;
        else if (r.status === "LATE") { present++; late++; }
        else if (r.status === "HALF_DAY") half++;
        else if (r.status === "LEAVE") leave++;
        minutes += r.workingMinutes;
      }
      return {
        employeeId: e.id,
        employeeNo: e.employeeNo,
        name: e.name,
        jobTitle: e.jobTitle || e.department || "Staff",
        workingDays,
        presentDays: present,
        lateDays: late,
        halfDays: half,
        leaveDays: leave,
        absentDays: Math.max(0, workingDays - (present + half + leave)),
        totalWorkingHours: fmtMinutes(minutes),
        records: e.attendance.map((r) => this.shape(r)),
      };
    });
    return { year, month, workingDays, summaries };
  }

  async correct(
    user: AuthUser,
    body: { employeeId: string; attendanceDate: string; status: string; checkIn?: string | null; checkOut?: string | null; reason: string },
  ) {
    const emp = await this.prisma.employee.findFirst({ where: { id: body.employeeId, deletedAt: null, ...this.scope(user) } });
    if (!emp) throw new BadRequestException("Employee not found.");
    const needsTimes = !["ABSENT", "LEAVE"].includes(body.status);
    if (needsTimes && !body.checkIn) throw new BadRequestException("Check-in time is required for this status.");
    const checkInAt = body.checkIn ? istInstant(body.attendanceDate, body.checkIn) : null;
    const checkOutAt = body.checkOut ? istInstant(body.attendanceDate, body.checkOut) : null;
    if (checkInAt && checkOutAt && checkOutAt <= checkInAt) throw new BadRequestException("Check-out must be after check-in.");
    const workingMinutes = checkInAt && checkOutAt ? Math.round((checkOutAt.getTime() - checkInAt.getTime()) / 60000) : 0;

    return this.prisma.tx(async (tx) => {
      const where = { employeeId_attendanceDate: { employeeId: emp.id, attendanceDate: body.attendanceDate } };
      const before = await tx.attendanceRecord.findUnique({ where });
      const data = { checkInAt, checkOutAt, workingMinutes, status: body.status, method: "ADMIN", correctionReason: body.reason, ...stampUpdate() };
      const rec = before
        ? await tx.attendanceRecord.update({ where, data })
        : await tx.attendanceRecord.create({ data: { ...data, employeeId: emp.id, attendanceDate: body.attendanceDate, branchId: emp.branchId, createdBy: user.id } });
      await this.audit.log({ entity: "attendance", entityId: rec.id, action: before ? "correct" : "create", before, after: rec }, tx);
      return this.shape(rec);
    });
  }
}
