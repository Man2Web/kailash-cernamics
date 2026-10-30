import { Body, Controller, ForbiddenException, Get, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { attendanceCheckSchema, attendanceCorrectionSchema, attendanceMonthQuery, attendancePublicSchema, attendanceTodayQuery, attendanceVerifySchema } from "@gc/shared";
import { z } from "zod";
import { CurrentUser, Perm, Public } from "../../common/decorators";
import type { AuthUser } from "../../common/context";
import { ZodPipe } from "../../common/zod.pipe";
import { AttendanceService, istDate } from "./attendance.service";
import { issueAttendanceToken, verifyAttendanceToken } from "./attendance-token";

/** The one role that may show the rotating QR code. It holds no permissions and no employee record. */
export const ATTENDANCE_DISPLAY_ROLE = "ATTENDANCE_DISPLAY";

@Controller("attendance")
export class AttendanceController {
  constructor(private readonly svc: AttendanceService) {}

  /** Rotating QR token. Only the dedicated attendance-screen login may call it, so staff cannot fetch it remotely. */
  @Get("qr-token")
  qrToken(@CurrentUser() me: AuthUser) {
    if (me.roleCode !== ATTENDANCE_DISPLAY_ROLE) throw new ForbiddenException("Only the attendance screen login can show the QR code.");
    return { ...issueAttendanceToken(), date: istDate() };
  }

  /** The signed-in employee's own status today. */
  @Get("me")
  me(@CurrentUser() me: AuthUser) {
    return this.svc.myToday(me);
  }

  @Post("check-in")
  checkIn(@CurrentUser() me: AuthUser, @Body(new ZodPipe(attendanceCheckSchema)) body: z.infer<typeof attendanceCheckSchema>) {
    return this.svc.checkIn(me, body.token);
  }

  @Post("check-out")
  checkOut(@CurrentUser() me: AuthUser, @Body(new ZodPipe(attendanceCheckSchema)) body: z.infer<typeof attendanceCheckSchema>) {
    return this.svc.checkOut(me, body.token);
  }

  /**
   * Scan page for someone who is not signed in: the rotating QR token proves they are at the office and their employee ID
   * or mobile number names them. Rate limited per address because these routes need no login.
   */
  /** Is the scanned QR code still valid? Lets the scan page warn straight away instead of after the employee types. */
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post("public/verify")
  verify(@Body(new ZodPipe(attendanceVerifySchema)) body: z.infer<typeof attendanceVerifySchema>) {
    return verifyAttendanceToken(body.token);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post("public/status")
  publicStatus(@Body(new ZodPipe(attendancePublicSchema)) body: z.infer<typeof attendancePublicSchema>) {
    return this.svc.publicStatus(body.identifier, body.token);
  }

  @Public()
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @Post("public/check-in")
  publicCheckIn(@Body(new ZodPipe(attendancePublicSchema)) body: z.infer<typeof attendancePublicSchema>) {
    return this.svc.publicCheckIn(body.identifier, body.token);
  }

  @Public()
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @Post("public/check-out")
  publicCheckOut(@Body(new ZodPipe(attendancePublicSchema)) body: z.infer<typeof attendancePublicSchema>) {
    return this.svc.publicCheckOut(body.identifier, body.token);
  }

  @Get("today")
  @Perm("attendance.read")
  today(@CurrentUser() me: AuthUser, @Query(new ZodPipe(attendanceTodayQuery)) q: z.infer<typeof attendanceTodayQuery>) {
    return this.svc.today(me, q.date);
  }

  @Get("month")
  @Perm("attendance.read")
  month(@CurrentUser() me: AuthUser, @Query(new ZodPipe(attendanceMonthQuery)) q: z.infer<typeof attendanceMonthQuery>) {
    return this.svc.month(me, q.year, q.month);
  }

  @Post("correct")
  @Perm("attendance.manage")
  correct(@CurrentUser() me: AuthUser, @Body(new ZodPipe(attendanceCorrectionSchema)) body: z.infer<typeof attendanceCorrectionSchema>) {
    return this.svc.correct(me, body);
  }
}
