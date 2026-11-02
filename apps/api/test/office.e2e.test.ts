import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, loginAs, TestCtx, SEED_PASSWORD } from "./helpers";
import { issueAttendanceToken, verifyAttendanceToken } from "../src/modules/office/attendance-token";
import { workingDaysInMonth } from "../src/modules/office/attendance.service";

describe("office: employees and attendance", () => {
  let t: TestCtx;
  let owner: Awaited<ReturnType<typeof loginAs>>;
  let screen: Awaited<ReturnType<typeof loginAs>>;
  let staffA: Awaited<ReturnType<typeof loginAs>>;
  let staffB: Awaited<ReturnType<typeof loginAs>>;
  let employeeA: string;
  let employeeB: string;
  const roleId = async (code: string) => (await t.prisma.role.findFirstOrThrow({ where: { code } })).id;
  const freshToken = (agent: { get: (u: string) => any }) => agent.get("/api/attendance/qr-token").then((r: any) => r.body.token as string);

  beforeAll(async () => {
    t = await createTestApp();
    owner = await loginAs(t.app);

    // The dedicated QR-screen login (no employee record).
    const mk = await owner.post("/api/users", { email: "screen@test.local", name: "QR Screen", roleId: await roleId("ATTENDANCE_DISPLAY"), password: SEED_PASSWORD });
    expect(mk.status).toBe(201);
    screen = await loginAs(t.app, "screen@test.local");

    // Two employees with their own logins.
    const a = await owner.post("/api/employees/with-login", {
      employeeNo: "kc-001", name: "Anita Staff", email: "anita@test.local", phone: "9876543210", jobTitle: "Sales", roleId: await roleId("SALES"), password: SEED_PASSWORD,
    });
    expect(a.status).toBe(201);
    employeeA = a.body.id;
    const b = await owner.post("/api/employees/with-login", {
      employeeNo: "kc-002", name: "Bala Staff", email: "bala@test.local", jobTitle: "Godown", roleId: await roleId("GODOWN"), password: SEED_PASSWORD,
    });
    employeeB = b.body.id;
    staffA = await loginAs(t.app, "anita@test.local");
    staffB = await loginAs(t.app, "bala@test.local");
  });
  afterAll(async () => {
    await t.app.close();
  });

  it("token: valid fresh token passes; forged, malformed and expired tokens are rejected", () => {
    const { token } = issueAttendanceToken();
    expect(verifyAttendanceToken(token).valid).toBe(true);
    const [r, ts] = token.split("-");
    expect(verifyAttendanceToken(`${r}-${ts}-0000000000000000`).valid).toBe(false);
    expect(verifyAttendanceToken("nonsense").valid).toBe(false);
    expect(verifyAttendanceToken("").valid).toBe(false);
    const old = issueAttendanceToken(Date.now() - 3 * 60_000);
    const res = verifyAttendanceToken(old.token);
    expect(res.valid).toBe(false);
    expect(res.message).toMatch(/expired/i);
  });

  it("only the dedicated QR-screen login can fetch the rotating QR code", async () => {
    expect((await screen.get("/api/attendance/qr-token")).status).toBe(200);
    expect((await owner.get("/api/attendance/qr-token")).status).toBe(403);
    expect((await staffA.get("/api/attendance/qr-token")).status).toBe(403);
  });

  it("the QR-screen login has no permissions: it cannot read employees or attendance, and cannot check in", async () => {
    expect((await screen.get("/api/employees")).status).toBe(403);
    expect((await screen.get("/api/attendance/today")).status).toBe(403);
    const token = await freshToken(screen);
    const res = await screen.post("/api/attendance/check-in", { token });
    expect(res.status).toBe(403);
  });

  it("creating an employee with a login links them and refuses the QR-screen role", async () => {
    const e = await t.prisma.employee.findUniqueOrThrow({ where: { id: employeeA } });
    expect(e.userId).toBeTruthy();
    expect(e.employeeNo).toBe("KC-001");
    const bad = await owner.post("/api/employees/with-login", {
      employeeNo: "KC-009", name: "Screen As Employee", email: "x@test.local", roleId: await roleId("ATTENDANCE_DISPLAY"), password: SEED_PASSWORD,
    });
    expect(bad.status).toBe(400);
    const dup = await owner.post("/api/employees/with-login", {
      employeeNo: "KC-001", name: "Dup", email: "dup@test.local", roleId: await roleId("SALES"), password: SEED_PASSWORD,
    });
    expect(dup.status).toBeGreaterThanOrEqual(400);
    expect(dup.status).toBeLessThan(500);
  });

  it("check-in: needs a real token, marks the employee, and a second scan says already checked in", async () => {
    const noToken = await staffA.post("/api/attendance/check-in", { token: "garbage-token-value" });
    expect(noToken.status).toBe(400);
    const ok = await staffA.post("/api/attendance/check-in", { token: await freshToken(screen) });
    expect(ok.status).toBe(201);
    expect(["PRESENT", "LATE"]).toContain(ok.body.record.status);
    const again = await staffA.post("/api/attendance/check-in", { token: await freshToken(screen) });
    expect(again.status).toBe(400);
    expect(again.body.message ?? JSON.stringify(again.body)).toMatch(/already checked in/i);
    const me = await staffA.get("/api/attendance/me");
    expect(me.body.state).toBe("CHECKED_IN");
  });

  it("concurrent scans create exactly one record", async () => {
    const tokens = await Promise.all([1, 2, 3, 4, 5].map(() => freshToken(screen)));
    const results = await Promise.all(tokens.map((token) => staffB.post("/api/attendance/check-in", { token })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await t.prisma.attendanceRecord.count({ where: { employeeId: employeeB } })).toBe(1);
  });

  it("check-out: closes the day once; checking out twice or without checking in is refused", async () => {
    const out = await staffA.post("/api/attendance/check-out", { token: await freshToken(screen) });
    expect(out.status).toBe(201);
    expect(out.body.record.checkOutAt).toBeTruthy();
    const twice = await staffA.post("/api/attendance/check-out", { token: await freshToken(screen) });
    expect(twice.status).toBe(400);
    expect((await staffA.get("/api/attendance/me")).body.state).toBe("COMPLETED");

    const sales = await loginAs(t.app, "sales@kailashceramics.com");
    const notLinked = await sales.post("/api/attendance/check-out", { token: await freshToken(screen) });
    expect(notLinked.status).toBe(403);
  });

  it("an inactive employee cannot check in", async () => {
    const c = await owner.post("/api/employees", { employeeNo: "KC-003", name: "Chitra Inactive", status: "INACTIVE" });
    expect(c.status).toBe(201);
    const login = await owner.post("/api/users", { email: "chitra@test.local", name: "Chitra", roleId: await roleId("SALES"), password: SEED_PASSWORD });
    const link = await owner.patch(`/api/employees/${c.body.id}`, { userId: login.body.id });
    expect(link.status).toBe(200);
    const chitra = await loginAs(t.app, "chitra@test.local");
    const res = await chitra.post("/api/attendance/check-in", { token: await freshToken(screen) });
    expect(res.status).toBe(403);
  });

  it("reports: today shows who is in; monthly counts match; permission-gated", async () => {
    const today = await owner.get("/api/attendance/today");
    expect(today.status).toBe(200);
    expect(today.body.summary.present).toBeGreaterThanOrEqual(2);
    const now = new Date();
    const month = await owner.get(`/api/attendance/month?year=${now.getFullYear()}&month=${now.getMonth() + 1}`);
    expect(month.status).toBe(200);
    const anita = month.body.summaries.find((s: any) => s.employeeNo === "KC-001");
    expect(anita.presentDays).toBe(1);
    expect(anita.workingDays).toBe(workingDaysInMonth(now.getFullYear(), now.getMonth() + 1));
    // Roles without attendance.read cannot see them.
    const godown = await loginAs(t.app, "godown@kailashceramics.com");
    expect((await godown.get("/api/attendance/today")).status).toBe(403);
    expect((await godown.get("/api/employees")).status).toBe(403);
    expect((await staffA.get("/api/employees")).status).toBe(403);
  });

  it("corrections: need the manage permission and a reason; they validate times and are audited", async () => {
    const date = "2026-10-05";
    const denied = await staffA.post("/api/attendance/correct", { employeeId: employeeA, attendanceDate: date, status: "LEAVE", reason: "x" });
    expect(denied.status).toBe(403);
    const noReason = await owner.post("/api/attendance/correct", { employeeId: employeeA, attendanceDate: date, status: "LEAVE", reason: "" });
    expect(noReason.status).toBe(400);
    const backwards = await owner.post("/api/attendance/correct", { employeeId: employeeA, attendanceDate: date, status: "PRESENT", checkIn: "10:00", checkOut: "09:00", reason: "typo" });
    expect(backwards.status).toBe(400);
    const missingIn = await owner.post("/api/attendance/correct", { employeeId: employeeA, attendanceDate: date, status: "PRESENT", reason: "forgot" });
    expect(missingIn.status).toBe(400);
    const ok = await owner.post("/api/attendance/correct", { employeeId: employeeA, attendanceDate: date, status: "PRESENT", checkIn: "09:05", checkOut: "18:05", reason: "Forgot to scan" });
    expect(ok.status).toBe(201);
    expect(ok.body.workingMinutes).toBe(540);
    expect(ok.body.method).toBe("ADMIN");
    const rec = await t.prisma.attendanceRecord.findFirstOrThrow({ where: { employeeId: employeeA, attendanceDate: date } });
    expect(await t.prisma.auditLog.count({ where: { entity: "attendance", entityId: rec.id } })).toBe(1);
  });

  it("deleting an employee keeps their attendance but blocks further check-ins", async () => {
    const del = await owner.del(`/api/employees/${employeeB}`);
    expect(del.status).toBe(200);
    expect(await t.prisma.attendanceRecord.count({ where: { employeeId: employeeB } })).toBe(1);
    const res = await staffB.post("/api/attendance/check-out", { token: await freshToken(screen) });
    expect(res.status).toBe(403);
  });

  it("updating one field of a user leaves their active flag and branch access alone", async () => {
    const branch = await t.prisma.branch.findFirstOrThrow({ where: { deletedAt: null } });
    const u = await owner.post("/api/users", {
      email: "partial@test.local", name: "Partial", roleId: await roleId("SALES"), password: SEED_PASSWORD, isActive: false, branchIds: [branch.id],
    });
    expect(u.status).toBe(201);
    const patch = await owner.patch(`/api/users/${u.body.id}`, { name: "Partial Renamed" });
    expect(patch.status).toBe(200);
    const after = await t.prisma.user.findUniqueOrThrow({ where: { id: u.body.id }, include: { branches: true } });
    expect(after.name).toBe("Partial Renamed");
    expect(after.isActive).toBe(false);
    expect(after.branches.map((b) => b.branchId)).toEqual([branch.id]);
  });

  it("scan page without signing in: ID or mobile number plus a live QR code checks the employee in and out", async () => {
    const guest = (await import("supertest")).default(t.app.getHttpServer());
    const call = async (kind: string, body: object) => guest.post(`/api/attendance/public/${kind}`).set("Idempotency-Key", crypto.randomUUID()).send(body);
    const tok = async () => (await screen.get("/api/attendance/qr-token")).body.token as string;

    const c = await owner.post("/api/employees", { employeeNo: "KC-050", name: "Deepa Walkin", phone: "+91 98765 11111" });
    expect(c.status).toBe(201);

    // Valid code check, and a rejected one
    expect((await call("verify", { token: await tok() })).body.valid).toBe(true);
    expect((await call("verify", { token: "x-1-0000000000000000" })).body.valid).toBe(false);
    const stale = issueAttendanceToken(Date.now() - 3 * 60_000).token;
    expect((await call("check-in", { token: stale, identifier: "9876511111" })).status).toBe(400);

    // Unknown number
    const unknown = await call("check-in", { token: await tok(), identifier: "9000000000" });
    expect(unknown.status).toBe(400);
    expect(JSON.stringify(unknown.body)).toMatch(/not registered/i);

    // Mobile number in a different format than stored, then employee ID for the second action
    const inn = await call("check-in", { token: await tok(), identifier: "098765-11111" });
    expect(inn.status).toBe(201);
    expect(inn.body.employeeName).toBe("Deepa Walkin");
    expect(inn.body.message).toMatch(/checked in at/i);
    const again = await call("check-in", { token: await tok(), identifier: "9876511111" });
    expect(again.status).toBe(400);
    const status = await call("status", { token: await tok(), identifier: "kc-050" });
    expect(status.body.state).toBe("CHECKED_IN");
    const out = await call("check-out", { token: await tok(), identifier: "KC-050" });
    expect(out.status).toBe(201);
    expect(out.body.message).toMatch(/checked out at/i);
    // No token, no entry: the identifier alone is never enough
    expect((await call("status", { identifier: "KC-050" })).status).toBe(400);
  });

  it("two employees sharing one mobile number cannot be checked in by that number", async () => {
    await owner.post("/api/employees", { employeeNo: "KC-060", name: "Twin One", phone: "9811111111" });
    await owner.post("/api/employees", { employeeNo: "KC-061", name: "Twin Two", phone: "9811111111" });
    const guest = (await import("supertest")).default(t.app.getHttpServer());
    const token = (await screen.get("/api/attendance/qr-token")).body.token as string;
    const res = await guest.post("/api/attendance/public/check-in").set("Idempotency-Key", crypto.randomUUID()).send({ token, identifier: "9811111111" });
    expect(res.status).toBe(400);
    expect(await t.prisma.attendanceRecord.count({ where: { employee: { employeeNo: { in: ["KC-060", "KC-061"] } } } })).toBe(0);
  });

  it("Super Admin sees every employee live with a feed of recent check-ins and check-outs, and can look at another day", async () => {
    const today = await owner.get("/api/attendance/today");
    expect(today.status).toBe(200);
    const names = today.body.rows.map((r: any) => r.name);
    expect(names).toEqual(expect.arrayContaining(["Anita Staff", "Deepa Walkin"]));
    const types = today.body.events.map((e: any) => e.type);
    expect(types).toContain("CHECK_IN");
    expect(types).toContain("CHECK_OUT");
    const times = today.body.events.map((e: any) => new Date(e.at).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times); // newest first
    const past = await owner.get("/api/attendance/today?date=2026-10-05");
    expect(past.status).toBe(200);
    expect(past.body.date).toBe("2026-10-05");
    expect(past.body.rows.find((r: any) => r.employeeNo === "KC-001").status).toBe("PRESENT"); // from the correction test
    expect((await owner.get("/api/attendance/today?date=garbage")).status).toBe(400);
  });

  it("employees can sign in with their mobile number as well as their email", async () => {
    const login = async (id: string, password: string) =>
      (await import("supertest")).default(t.app.getHttpServer()).post("/api/auth/login").send({ email: id, password });
    const first = await login("9876543210", SEED_PASSWORD);
    expect(first.status, JSON.stringify(first.body) + JSON.stringify(await t.prisma.user.findMany({ where: { phone: { not: null } }, select: { email: true, phone: true, isActive: true } }))).toBe(200); // Anita, number stored as 9876543210
    expect((await login("+91 98765 43210", SEED_PASSWORD)).status).toBe(200);
    expect((await login("anita@test.local", SEED_PASSWORD)).status).toBe(200);
    expect((await login("9876543210", "wrong-password")).status).toBe(401);
    expect((await login("9123456789", SEED_PASSWORD)).status).toBe(401); // unknown number
    expect((await login("12345", SEED_PASSWORD)).status).toBe(401); // too short to be a number
  });
  it("Tally is Super Admin only by default: other roles cannot open it and the dashboard hides its figures", async () => {
    const mgr = await loginAs(t.app, "manager@kailashceramics.com");
    expect((await mgr.get("/api/tally/sync")).status).toBe(403);
    expect((await mgr.get("/api/dashboard")).body.tally).toBeNull();
    expect((await owner.get("/api/tally/sync")).status).toBe(200);
    expect((await owner.get("/api/dashboard")).body.tally).not.toBeNull();
  });

  it("Super Admin picks exactly what a new employee can see while creating them", async () => {
    const codes = ["catalogue.read", "stock.read", "tally.read"];
    const c = await owner.post("/api/employees/with-login", {
      employeeNo: "KC-070", name: "Custom Access", email: "custom@test.local", roleId: await roleId("SALES"), password: SEED_PASSWORD,
      access: { useCustomAccess: true, codes },
    });
    expect(c.status).toBe(201);
    const custom = await loginAs(t.app, "custom@test.local");
    const me = await custom.get("/api/auth/me");
    expect([...me.body.permissions].sort()).toEqual([...codes].sort());
    expect((await custom.get("/api/products")).status).toBe(200); // catalogue.read
    expect((await custom.get("/api/invoices")).status).toBe(403); // a Sales role would allow this; the custom choice does not
    expect((await custom.get("/api/tally/sync")).status).toBe(200); // Tally given on purpose
    expect((await custom.get("/api/attendance/today")).status).toBe(403);
  });

  it("Super Admin can change or take away access later, and put the person back on their role", async () => {
    const user = await t.prisma.user.findUniqueOrThrow({ where: { email: "custom@test.local" } });
    const custom = await loginAs(t.app, "custom@test.local");
    expect((await custom.get("/api/tally/sync")).status).toBe(200);

    const hide = await owner.put(`/api/users/${user.id}/access`, { useCustomAccess: true, codes: ["catalogue.read", "stock.read"] });
    expect(hide.status).toBe(200);
    expect(hide.body.effective).toEqual(["catalogue.read", "stock.read"]);
    expect((await custom.get("/api/tally/sync")).status).toBe(403); // hidden straight away, no re-login needed

    const back = await owner.put(`/api/users/${user.id}/access`, { useCustomAccess: false, codes: [] });
    expect(back.body.useCustomAccess).toBe(false);
    expect((await custom.get("/api/invoices")).status).toBe(200); // Sales role defaults apply again
    expect((await custom.get("/api/tally/sync")).status).toBe(403); // and Tally is not part of any role

    const shape = await owner.get(`/api/users/${user.id}/access`);
    expect(shape.body).toMatchObject({ roleCode: "SALES", useCustomAccess: false });
    expect(shape.body.rolePermissions.length).toBeGreaterThan(5);
    expect(await t.prisma.auditLog.count({ where: { entity: "user", entityId: user.id, action: "set_access" } })).toBe(2);
  });

  it("access choices are validated, and the Super Admin account cannot be restricted", async () => {
    const user = await t.prisma.user.findUniqueOrThrow({ where: { email: "custom@test.local" } });
    expect((await owner.put(`/api/users/${user.id}/access`, { useCustomAccess: true, codes: ["not.a.permission"] })).status).toBe(400);
    const admin = await t.prisma.user.findUniqueOrThrow({ where: { email: "admin@kailashceramics.com" } });
    expect((await owner.put(`/api/users/${admin.id}/access`, { useCustomAccess: true, codes: ["stock.read"] })).status).toBe(400);
    expect((await owner.put("/api/users/00000000-0000-0000-0000-000000000000/access", { useCustomAccess: false, codes: [] })).status).toBe(404);
    const bad = await owner.post("/api/employees/with-login", {
      employeeNo: "KC-071", name: "Bad Codes", email: "bad@test.local", roleId: await roleId("SALES"), password: SEED_PASSWORD,
      access: { useCustomAccess: true, codes: ["nope"] },
    });
    expect(bad.status).toBe(400);
    expect(await t.prisma.employee.count({ where: { employeeNo: "KC-071" } })).toBe(0); // nothing half-created
  });

  it("only the Super Admin can decide access: even someone allowed to manage users cannot", async () => {
    // A user-manager who is not the Super Admin: custom access with user + employee write.
    const c = await owner.post("/api/employees/with-login", {
      employeeNo: "KC-072", name: "User Manager", email: "usermgr@test.local", roleId: await roleId("SALES"), password: SEED_PASSWORD,
      access: { useCustomAccess: true, codes: ["user.read", "user.write", "employee.read", "employee.write"] },
    });
    expect(c.status).toBe(201);
    const um = await loginAs(t.app, "usermgr@test.local");
    const target = await t.prisma.user.findUniqueOrThrow({ where: { email: "custom@test.local" } });
    expect((await um.get(`/api/users/${target.id}/access`)).status).toBe(403);
    expect((await um.put(`/api/users/${target.id}/access`, { useCustomAccess: true, codes: ["tally.read"] })).status).toBe(403);
    const withAccess = await um.post("/api/employees/with-login", {
      employeeNo: "KC-073", name: "Sneaky", email: "sneaky@test.local", roleId: await roleId("SALES"), password: SEED_PASSWORD,
      access: { useCustomAccess: true, codes: ["tally.read"] },
    });
    expect(withAccess.status).toBe(403);
    expect(await t.prisma.user.count({ where: { email: "sneaky@test.local" } })).toBe(0);
    // Roles and the permission matrix are the Super Admin's too.
    const salesRole = await roleId("SALES");
    expect((await um.put(`/api/roles/${salesRole}/permissions`, { codes: ["tally.read", "tally.write"] })).status).toBe(403);
    expect((await um.post("/api/roles", { code: "SNEAKY", name: "Sneaky" })).status).toBe(403);
    // They can still create an ordinary employee with the role defaults (no access choice).
    const plain = await um.post("/api/employees/with-login", {
      employeeNo: "KC-074", name: "Plain Staff", email: "plain@test.local", roleId: salesRole, password: SEED_PASSWORD,
    });
    expect(plain.status).toBe(201);
  });

  it("an employee created for all branches can still open the app: their login gets every active branch", async () => {
    const c = await owner.post("/api/employees/with-login", {
      employeeNo: "KC-080", name: "All Branches", email: "allbr@test.local", roleId: await roleId("SALES"), password: SEED_PASSWORD,
    });
    expect(c.status).toBe(201);
    const me = await (await loginAs(t.app, "allbr@test.local")).get("/api/auth/me");
    const active = await t.prisma.branch.count({ where: { deletedAt: null, isActive: true } });
    expect(me.body.branches.length).toBe(active);
    expect(me.body.branches.length).toBeGreaterThan(0);
  });
});
