import { Body, Controller, Get, HttpCode, Post, Query, Req, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { CookieOptions, Request, Response } from "express";
import { z } from "zod";
import { changePasswordSchema, listQuerySchema, loginSchema, LoginInput } from "@gc/shared";
import { PrismaService } from "../prisma/prisma.service";
import { CurrentUser, Perm, Public, SkipIdempotency } from "../common/decorators";
import type { AuthUser } from "../common/context";
import { ZodPipe } from "../common/zod.pipe";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "../common/guards";
import { paginate } from "../common/pagination";
import { ACCESS_TTL_MS, AuthService, REFRESH_TTL_MS } from "./auth.service";

/**
 * Secure cookies need HTTPS. COOKIE_SECURE=true|false forces it; otherwise it follows the request
 * protocol as reported by the proxies (Traefik → Next.js → API), so a temporary http URL still works.
 */
function cookieBase(req: Request): CookieOptions {
  const forced = process.env.COOKIE_SECURE;
  const secure = forced === "true" ? true : forced === "false" ? false : req.secure;
  return { httpOnly: true, sameSite: "lax", secure, path: "/" };
}

function setCookies(req: Request, res: Response, t: { accessToken: string; refreshToken: string }) {
  res.cookie(ACCESS_COOKIE, t.accessToken, { ...cookieBase(req), maxAge: ACCESS_TTL_MS() });
  res.cookie(REFRESH_COOKIE, t.refreshToken, { ...cookieBase(req), path: "/api/auth", maxAge: REFRESH_TTL_MS() });
  // non-httpOnly hint so the web middleware knows a session exists (contains no secret)
  res.cookie("gc_session", "1", { ...cookieBase(req), httpOnly: false, maxAge: REFRESH_TTL_MS() });
}

function meta(req: Request) {
  return { ip: (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() || req.ip, userAgent: req.headers["user-agent"] };
}

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @SkipIdempotency()
  @Throttle({ default: { limit: Number(process.env.LOGIN_RATE_LIMIT ?? 5), ttl: 60_000 } })
  @Post("login")
  @HttpCode(200)
  async login(@Body(new ZodPipe(loginSchema)) body: LoginInput, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const out = await this.auth.login(body, meta(req));
    setCookies(req, res, out);
    return out.user;
  }

  @Public()
  @SkipIdempotency()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post("refresh")
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const t = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE], meta(req));
    setCookies(req, res, t);
    return { ok: true };
  }

  @Public()
  @SkipIdempotency()
  @Post("logout")
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(ACCESS_COOKIE, cookieBase(req));
    res.clearCookie(REFRESH_COOKIE, { ...cookieBase(req), path: "/api/auth" });
    res.clearCookie("gc_session", { ...cookieBase(req), httpOnly: false });
    return { ok: true };
  }

  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.auth.session(user.id);
  }

  @SkipIdempotency()
  @Post("change-password")
  @HttpCode(200)
  async changePassword(@CurrentUser() user: AuthUser, @Body(new ZodPipe(changePasswordSchema)) body: z.infer<typeof changePasswordSchema>) {
    await this.auth.changePassword(user.id, body.currentPassword, body.newPassword);
    return { ok: true };
  }

  @Post("totp/setup")
  totpSetup(@CurrentUser() user: AuthUser) {
    return this.auth.totpSetup(user.id);
  }

  @Post("totp/enable")
  totpEnable(@CurrentUser() user: AuthUser, @Body(new ZodPipe(z.object({ code: z.string().regex(/^\d{6}$/) }))) body: { code: string }) {
    return this.auth.totpEnable(user.id, body.code);
  }

  /** Login history, visible to the owner. */
  @Get("login-history")
  @Perm("audit.read")
  history(@Query(new ZodPipe(listQuerySchema)) q: any) {
    return paginate(this.prisma.loginEvent, q, { orderBy: { createdAt: "desc" } });
  }
}
