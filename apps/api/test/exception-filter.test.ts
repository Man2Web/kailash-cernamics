import { describe, expect, it } from "vitest";
import { HttpException, HttpStatus } from "@nestjs/common";
import { ThrottlerException } from "@nestjs/throttler";
import { AllExceptionsFilter } from "../src/common/exception.filter";

function run(exception: unknown) {
  let out: { status?: number; body?: any } = {};
  const res = { status: (s: number) => ({ json: (b: any) => (out = { status: s, body: b }) }) };
  new AllExceptionsFilter().catch(exception, { switchToHttp: () => ({ getResponse: () => res }) } as any);
  return out;
}

describe("error filter", () => {
  it("shows people a plain message when the rate limit is hit, not the library text", () => {
    const r = run(new ThrottlerException());
    expect(r.status).toBe(429);
    expect(r.body.message).toBe("Too many attempts. Please wait a minute and try again.");
  });

  it("leaves other HTTP errors as they are", () => {
    const r = run(new HttpException("Email, mobile number or password is wrong", HttpStatus.UNAUTHORIZED));
    expect(r.status).toBe(401);
    expect(r.body.message).toBe("Email, mobile number or password is wrong");
  });
});
