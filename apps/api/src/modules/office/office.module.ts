import { Module } from "@nestjs/common";
import { AttendanceController } from "./attendance.controller";
import { AttendanceService } from "./attendance.service";
import { EmployeesController } from "./employees.controller";

@Module({
  controllers: [AttendanceController, EmployeesController],
  providers: [AttendanceService],
})
export class OfficeModule {}
