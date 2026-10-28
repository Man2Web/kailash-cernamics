/**
 * Database-free security regression tests. Run with:
 *   npx tsx --test tests/security/hardening.unit.test.ts
 */
import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

process.env.ATTENDANCE_QR_SECRET ||= "unit-test-secret-0123456789abcdef";

test("bridge key: empty / missing / wrong keys never authenticate", async () => {
  const { isValidBridgeKey } = await import("../../src/lib/tally/bridge-auth");
  assert.equal(isValidBridgeKey(null, ""), false);
  assert.equal(isValidBridgeKey("", ""), false);
  assert.equal(isValidBridgeKey("abc", ""), false);
  assert.equal(isValidBridgeKey("abc", "abd"), false);
  assert.equal(isValidBridgeKey("abc", "abcd"), false);
  assert.equal(isValidBridgeKey("abc", "abc"), true);
});

test("attendance token: fresh token valid, tampered/expired/garbage rejected", async () => {
  const { generateDynamicAttendanceToken, validateAttendanceToken } = await import("../../src/lib/attendance/token");
  const { token } = await generateDynamicAttendanceToken();
  assert.equal((await validateAttendanceToken(token)).valid, true);

  const [rand, ts, hash] = token.split("-");
  const forged = `${rand}-${ts}-${"0".repeat(hash.length)}`;
  assert.equal((await validateAttendanceToken(forged)).valid, false);

  // Correct format but old timestamp (signature irrelevant: expiry is checked first)
  const old = `${rand}-${Date.now() - 10 * 60 * 1000}-${hash}`;
  assert.equal((await validateAttendanceToken(old)).valid, false);

  // Wrong-length hash must be rejected, not throw
  assert.equal((await validateAttendanceToken(`${rand}-${ts}-abc`)).valid, false);
  assert.equal((await validateAttendanceToken("")).valid, false);
  assert.equal((await validateAttendanceToken("not-a-token")).valid, false);
});

test("attendance API: unauthenticated requests get 401 (GET, POST, STATUS)", async () => {
  const { GET, POST } = await import("../../src/app/api/attendance/route");

  const g = await GET(new NextRequest("http://localhost/api/attendance?identifier=9999999999"));
  assert.equal(g.status, 401);

  const gBad = await GET(new NextRequest("http://localhost/api/attendance?identifier=9999999999&token=bogus"));
  assert.equal(gBad.status, 401);

  for (const action of ["STATUS", "CHECK_IN", "CHECK_OUT"]) {
    const p = await POST(
      new NextRequest("http://localhost/api/attendance", {
        method: "POST",
        body: JSON.stringify({ identifier: "9999999999", action }),
      })
    );
    assert.equal(p.status, 401, `${action} must require a session or valid QR token`);
  }
});

test("login throttling: account key is stable, case-insensitive and not the raw identifier", async () => {
  const { accountKey } = await import("../../src/lib/auth/rate-limit");
  assert.equal(accountKey("User@Example.com "), accountKey("user@example.com"));
  assert.notEqual(accountKey("a@b.c"), accountKey("a@b.d"));
  assert.ok(!accountKey("user@example.com").includes("user@example.com"));
});

test("cron cleanup endpoint rejects missing / wrong bearer secret", async () => {
  const { GET } = await import("../../src/app/api/cron/cleanup/route");
  const none = await GET(new NextRequest("http://localhost/api/cron/cleanup"));
  assert.equal(none.status, 401);
  const wrong = await GET(
    new NextRequest("http://localhost/api/cron/cleanup", { headers: { authorization: "Bearer wrong" } })
  );
  assert.equal(wrong.status, 401);
});
