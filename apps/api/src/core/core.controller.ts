import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { z } from "zod";
import { listQuerySchema } from "@gc/shared";
import { PrismaService } from "../prisma/prisma.service";
import { CurrentUser, Perm, Public } from "../common/decorators";
import { assertSuperAdmin } from "../common/super-admin";
import { FEATURE_KEYS, type FeatureFlags, type FeatureKey } from "@gc/shared";
import type { AuthUser } from "../common/context";
import { ZodPipe } from "../common/zod.pipe";
import { paginate, pickFilters } from "../common/pagination";
import { StorageService } from "./storage.service";
import { ApprovalService } from "./approval.service";
import { SettingsService } from "./settings.service";
import { AuditService } from "./audit.service";

const decideSchema = z.object({ approve: z.boolean(), note: z.string().max(500).optional() });

/** Health, files, approvals inbox, notifications, settings and audit log. */
@Controller()
export class CoreController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly approvals: ApprovalService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  @Public()
  @Get("health")
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: "ok", db: "ok", time: new Date().toISOString() };
  }

  // ---- files
  @Post("files")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 8 * 1024 * 1024 } }))
  async upload(@UploadedFile() file: Express.Multer.File, @Query("folder") folder?: string) {
    if (!file) throw new BadRequestException("No file uploaded");
    if (!/^(image\/|application\/pdf)/.test(file.mimetype)) throw new BadRequestException("Only images or PDF files are allowed");
    return this.storage.save(file.buffer, file.originalname, file.mimetype, folder || "misc");
  }

  @Get("files/*key")
  async file(@Param("key") key: string | string[], @Res() res: Response) {
    const k = Array.isArray(key) ? key.join("/") : key;
    const { body, contentType } = await this.storage.read(k);
    if (contentType) res.type(contentType);
    else res.type(k.split(".").pop() || "application/octet-stream");
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.send(body);
  }

  // ---- approvals inbox
  @Get("approvals")
  async approvalsList(@Query(new ZodPipe(listQuerySchema.extend({ status: z.string().optional(), type: z.string().optional() }))) q: any) {
    return paginate(this.prisma.approvalRequest, q, {
      where: { deletedAt: null, ...pickFilters(q, ["status", "type"]) },
      include: { requestedBy: { select: { name: true } }, decidedBy: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  @Post("approvals/:id/decide")
  decide(@Param("id") id: string, @Body(new ZodPipe(decideSchema)) body: z.infer<typeof decideSchema>) {
    return this.approvals.decide(id, body.approve, body.note);
  }

  // ---- notifications
  @Get("notifications")
  async notifications(@CurrentUser() user: AuthUser) {
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({ where: { userId: user.id, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 50 }),
      this.prisma.notification.count({ where: { userId: user.id, readAt: null, deletedAt: null } }),
    ]);
    return { items, unread };
  }

  @Post("notifications/read-all")
  async readAll(@CurrentUser() user: AuthUser) {
    await this.prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }

  // ---- settings
  @Get("settings")
  @Perm("org.read")
  allSettings() {
    return this.settings.all();
  }

  @Put("settings")
  @Perm("org.write")
  async saveSettings(@Body(new ZodPipe(z.record(z.string(), z.unknown()))) body: Record<string, unknown>) {
    const before = await this.settings.all();
    // Module on/off switches are the Super Admin's alone and have their own endpoint, so they are never taken from here.
    for (const [k, v] of Object.entries(body)) if (!k.startsWith("feature.")) await this.settings.set(k, v);
    const after = await this.settings.all();
    await this.audit.log({ entity: "setting", entityId: "settings", action: "update", before, after });
    return after;
  }

  // ---- module on/off switches
  /** Which modules are switched on. Open to every signed-in user so menus and the dashboard can hide what is off. */
  @Get("features")
  features() {
    return this.settings.features();
  }

  /** Turn whole modules on or off for the company, including for the Super Admin. Super Admin only. */
  @Put("features")
  async setFeatures(
    @Body(new ZodPipe(z.object(Object.fromEntries(FEATURE_KEYS.map((k) => [k, z.boolean().optional()])) as Record<FeatureKey, z.ZodOptional<z.ZodBoolean>>))) body: Partial<FeatureFlags>,
    @CurrentUser() me: AuthUser,
  ) {
    assertSuperAdmin(me);
    const before = await this.settings.features();
    await this.settings.setFeatures(body);
    const after = await this.settings.features();
    await this.audit.log({ entity: "setting", entityId: "features", action: "set_features", before, after });
    return after;
  }

  // ---- audit log
  @Get("audit-log")
  @Perm("audit.read")
  auditLog(@Query(new ZodPipe(listQuerySchema.extend({ entity: z.string().optional(), entityId: z.string().optional() }))) q: any) {
    return paginate(this.prisma.auditLog, q, {
      where: pickFilters(q, ["entity", "entityId"]),
      orderBy: { createdAt: "desc" },
    });
  }
}
