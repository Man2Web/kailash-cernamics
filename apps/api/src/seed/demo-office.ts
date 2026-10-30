import type { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";
import { SEED_PASSWORD, SEED_USERS } from "./base";

// Demo office data: an employee record for each demo login, a few days of attendance, and the dedicated
// attendance-screen login. Idempotent. Demo logins stay disabled when SEED_DEMO_USERS=false (hosted environments).

const EMPLOYEES: { email: string; no: string; jobTitle: string; department: string; phone: string }[] = [
  { email: "manager@kailashceramics.com", no: "KC-EMP-001", jobTitle: "Branch manager", department: "Management", phone: "9840000001" },
  { email: "sales@kailashceramics.com", no: "KC-EMP-002", jobTitle: "Sales counter", department: "Sales", phone: "9840000002" },
  { email: "accounts@kailashceramics.com", no: "KC-EMP-003", jobTitle: "Accountant", department: "Accounts", phone: "9840000003" },
  { email: "godown@kailashceramics.com", no: "KC-EMP-004", jobTitle: "Godown supervisor", department: "Godown", phone: "9840000004" },
];

export const ATTENDANCE_SCREEN_EMAIL = "attendance@kailashceramics.com";

const istDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export async function seedDemoOffice(prisma: PrismaClient, base: { branch: { id: string }; roles: Record<string, string> }) {
  const demoLogins = process.env.SEED_DEMO_USERS !== "false";
  const argon = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

  for (const [i, e] of EMPLOYEES.entries()) {
    const seedUser = SEED_USERS.find((u) => u.email === e.email);
    const user = await prisma.user.findUnique({ where: { email: e.email } });
    const emp = await prisma.employee.upsert({
      where: { employeeNo: e.no },
      create: {
        employeeNo: e.no,
        name: seedUser?.name ?? e.jobTitle,
        email: e.email,
        phone: e.phone,
        jobTitle: e.jobTitle,
        department: e.department,
        branchId: base.branch.id,
        userId: user && !(await prisma.employee.findUnique({ where: { userId: user.id } })) ? user.id : null,
      },
      update: {},
    });
    // Let them sign in with their mobile number too.
    if (user) await prisma.user.update({ where: { id: user.id }, data: { phone: e.phone } });
    // The last four days: mostly on time, one late arrival, one day off.
    for (let back = 1; back <= 4; back++) {
      const day = new Date(Date.now() - back * 86_400_000);
      if (day.getUTCDay() === 0) continue; // Sunday off
      const date = istDate(day);
      const late = (i + back) % 5 === 0;
      const off = (i + back) % 7 === 0;
      const inAt = new Date(`${date}T${late ? "09:40" : "09:05"}:00+05:30`);
      const outAt = new Date(`${date}T18:10:00+05:30`);
      await prisma.attendanceRecord.upsert({
        where: { employeeId_attendanceDate: { employeeId: emp.id, attendanceDate: date } },
        create: off
          ? { employeeId: emp.id, attendanceDate: date, status: "LEAVE", method: "ADMIN", correctionReason: "Demo leave", branchId: base.branch.id }
          : { employeeId: emp.id, attendanceDate: date, checkInAt: inAt, checkOutAt: outAt, workingMinutes: Math.round((outAt.getTime() - inAt.getTime()) / 60000), status: late ? "LATE" : "PRESENT", method: "QR", branchId: base.branch.id },
        update: {},
      });
    }
  }

  // Dedicated login for the shared attendance QR screen (no permissions, no employee record).
  const passwordHash = await hash(SEED_PASSWORD, argon);
  const lockedHash = await hash(randomBytes(32).toString("hex"), argon);
  const screen = await prisma.user.upsert({
    where: { email: ATTENDANCE_SCREEN_EMAIL },
    create: {
      email: ATTENDANCE_SCREEN_EMAIL,
      name: "Attendance QR Screen",
      passwordHash: demoLogins ? passwordHash : lockedHash,
      isActive: demoLogins,
      roleId: base.roles["ATTENDANCE_DISPLAY"],
      defaultBranchId: base.branch.id,
    },
    update: demoLogins ? {} : { isActive: false },
  });
  await prisma.userBranch.upsert({
    where: { userId_branchId: { userId: screen.id, branchId: base.branch.id } },
    create: { userId: screen.id, branchId: base.branch.id },
    update: {},
  });
  console.log("demo-office: %d employees with attendance, attendance screen login %s", EMPLOYEES.length, ATTENDANCE_SCREEN_EMAIL);
}
