import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import request from "supertest";
import { createTestApp, TestCtx } from "./helpers";

describe("accounts moved over from the previous app keep their passwords", () => {
  let t: TestCtx;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.app.close();
  });

  it("a bcrypt password works once and is upgraded to argon2; a wrong one is refused and nothing changes", async () => {
    const role = await t.prisma.role.findFirstOrThrow({ where: { code: "SALES" } });
    const oldHash = await bcrypt.hash("OldApp#Pass1", 10);
    const user = await t.prisma.user.create({ data: { email: "moved@test.local", name: "Moved User", roleId: role.id, passwordHash: oldHash } });
    const login = (password: string) => request(t.app.getHttpServer()).post("/api/auth/login").send({ email: "moved@test.local", password });

    expect((await login("wrong-password")).status).toBe(401);
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash).toBe(oldHash); // untouched by a failed try

    expect((await login("OldApp#Pass1")).status).toBe(200);
    const upgraded = (await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash;
    expect(upgraded.startsWith("$argon2")).toBe(true);

    expect((await login("OldApp#Pass1")).status).toBe(200); // still works, now through argon2
    expect((await login("wrong-password")).status).toBe(401);
  });
});
