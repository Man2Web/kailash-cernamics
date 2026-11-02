import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { hash, verify } from "@node-rs/argon2";
import bcrypt from "bcryptjs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { LoginInput, SessionUser } from "@gc/shared";
import { PrismaService } from "../prisma/prisma.service";
import { invalidateUserCache, loadAuthUser } from "../common/guards";
import { generateSecret, otpauthUrl, verifyTotp } from "./totp";

function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

function ttlMs(v: string | undefined, fallback: number): number {
  if (!v) return fallback;
  const m = /^(\d+)([smhd])$/.exec(v);
  if (!m) return fallback;
  return Number(m[1]) * { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2] as "s" | "m" | "h" | "d"];
}

export const ACCESS_TTL_MS = () => ttlMs(process.env.JWT_ACCESS_TTL, 15 * 60_000);
export const REFRESH_TTL_MS = () => ttlMs(process.env.JWT_REFRESH_TTL, 7 * 86_400_000);

export function hashPassword(pw: string) {
  return hash(pw, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /** Sign in with an email address or a mobile number (last 10 digits). A number shared by two accounts matches neither. */
  private async findLoginUser(identifier: string) {
    if (identifier.includes("@")) return this.prisma.user.findUnique({ where: { email: identifier }, include: { role: true } });
    const digits = identifier.replace(/\D/g, "").slice(-10);
    if (digits.length < 10) return null;
    const candidates = await this.prisma.user.findMany({
      where: { phone: { not: null }, deletedAt: null, isActive: true },
      include: { role: true },
    });
    const matches = candidates.filter((u) => (u.phone ?? "").replace(/\D/g, "").slice(-10) === digits);
    return matches.length === 1 ? matches[0] : null;
  }

  async login(input: LoginInput, meta: { ip?: string; userAgent?: string }) {
    const user = await this.findLoginUser(input.email);
    const fail = async (reason: string, userId?: string) => {
      await this.prisma.loginEvent.create({ data: { email: input.email, userId, success: false, reason, ip: meta.ip, userAgent: meta.userAgent } });
      throw new UnauthorizedException("Email, mobile number or password is wrong");
    };
    if (!user || user.deletedAt || !user.isActive) return fail("unknown or inactive user", user?.id);
    // Accounts moved over from the previous Kailash app still hold bcrypt hashes. They are accepted once, then upgraded
    // to argon2 straight away, so employees keep their passwords and the old format disappears with use.
    const legacy = /^\$2[aby]\$/.test(user.passwordHash);
    const ok = legacy ? await bcrypt.compare(input.password, user.passwordHash).catch(() => false) : await verify(user.passwordHash, input.password).catch(() => false);
    if (!ok) return fail("bad password", user.id);
    if (legacy) await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(input.password) } });
    if (user.totpEnabled && user.totpSecret) {
      if (!input.totp) throw new UnauthorizedException({ message: "Enter the 6-digit code from your authenticator app", code: "TOTP_REQUIRED" });
      if (!verifyTotp(user.totpSecret, input.totp)) return fail("bad totp", user.id);
    }
    await this.prisma.loginEvent.create({ data: { email: input.email, userId: user.id, success: true, ip: meta.ip, userAgent: meta.userAgent } });
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const tokens = await this.issue(user.id, randomUUID(), meta);
    return { ...tokens, user: await this.session(user.id) };
  }

  /** Rotate the refresh token. Re-use of a revoked token revokes the whole family (theft detection). */
  async refresh(raw: string | undefined, meta: { ip?: string; userAgent?: string }) {
    if (!raw) throw new UnauthorizedException("Please sign in");
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(raw) } });
    if (!row) throw new UnauthorizedException("Please sign in");
    if (row.revokedAt) {
      await this.prisma.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
      throw new UnauthorizedException("Session ended. Please sign in again");
    }
    if (row.expiresAt < new Date()) throw new UnauthorizedException("Session expired");
    const tokens = await this.issue(row.userId, row.familyId, meta);
    await this.prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date(), replacedById: tokens.refreshId } });
    return tokens;
  }

  async logout(raw: string | undefined) {
    if (!raw) return;
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(raw) } });
    if (row) await this.prisma.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  private async issue(userId: string, familyId: string, meta: { ip?: string; userAgent?: string }) {
    const accessToken = await this.jwt.signAsync({ sub: userId }, { secret: process.env.JWT_ACCESS_SECRET, expiresIn: Math.floor(ACCESS_TTL_MS() / 1000) });
    const refreshToken = randomBytes(48).toString("base64url");
    const rt = await this.prisma.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS()),
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 300),
      },
    });
    return { accessToken, refreshToken, refreshId: rt.id };
  }

  async session(userId: string): Promise<SessionUser> {
    invalidateUserCache(userId);
    const u = await loadAuthUser(this.prisma, userId);
    if (!u) throw new UnauthorizedException();
    const [role, branches, row] = await Promise.all([
      this.prisma.role.findUniqueOrThrow({ where: { id: u.roleId } }),
      this.prisma.branch.findMany({ where: { id: { in: u.branchIds } }, orderBy: { code: "asc" } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { totpEnabled: true } }),
    ]);
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      role: { id: role.id, code: role.code, name: role.name, discountLimitPct: role.discountLimitPct },
      permissions: [...u.permissions],
      branches: branches.map((b) => ({ id: b.id, code: b.code, name: b.name, stateCode: b.stateCode })),
      defaultBranchId: u.defaultBranchId,
      totpEnabled: row.totpEnabled,
    };
  }

  async changePassword(userId: string, current: string, next: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await verify(u.passwordHash, current).catch(() => false))) throw new BadRequestException("Current password is wrong");
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next), updatedBy: userId } });
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async totpSetup(userId: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const secret = generateSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { totpSecret: secret, totpEnabled: false } });
    return { secret, otpauthUrl: otpauthUrl(secret, u.email) };
  }

  async totpEnable(userId: string, code: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!u.totpSecret || !verifyTotp(u.totpSecret, code)) throw new BadRequestException("Code does not match. Try again");
    await this.prisma.user.update({ where: { id: userId }, data: { totpEnabled: true } });
    return { ok: true };
  }
}
