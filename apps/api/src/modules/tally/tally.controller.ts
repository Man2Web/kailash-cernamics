import { Body, CanActivate, Controller, ExecutionContext, Get, HttpCode, Injectable, Param, Post, Query, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { listQuerySchema, tallyAckSchema, TallyAck, tallyAgentCreateSchema, tallyHeartbeatSchema, tallyInboundSchema, TallyInbound } from "@gc/shared";
import type { TallyAgent } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { Perm, Public, SkipIdempotency } from "../../common/decorators";
import { ctx } from "../../common/context";
import { ZodPipe } from "../../common/zod.pipe";
import { paginate, pickFilters, searchWhere } from "../../common/pagination";
import { TallyService } from "./tally.service";

/** Agent endpoints authenticate with the per-branch X-Agent-Key header (stored hashed). */
@Injectable()
export class AgentKeyGuard implements CanActivate {
  constructor(private readonly tally: TallyService) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request & { agent?: TallyAgent }>();
    const agent = await this.tally.authenticate(req.headers["x-agent-key"] as string | undefined);
    if (!agent) throw new UnauthorizedException("Invalid or missing X-Agent-Key");
    req.agent = agent;
    const store = ctx();
    store.agentId = agent.id;
    store.branchId = agent.branchId;
    return true;
  }
}

type AgentReq = Request & { agent: TallyAgent };

@Controller("tally")
export class TallyAgentController {
  constructor(private readonly tally: TallyService) {}

  @Public()
  @UseGuards(AgentKeyGuard)
  @Get("queue")
  queue(@Query(new ZodPipe(z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }))) q: { limit: number }, @Req() req: AgentReq) {
    return this.tally.pull(req.agent, q.limit);
  }

  @Public()
  @UseGuards(AgentKeyGuard)
  @Post("ack")
  @HttpCode(200)
  ack(@Body(new ZodPipe(tallyAckSchema)) body: TallyAck, @Req() req: AgentReq) {
    return this.tally.ack(req.agent, body);
  }

  @Public()
  @UseGuards(AgentKeyGuard)
  @Post("inbound")
  @HttpCode(200)
  inbound(@Body(new ZodPipe(tallyInboundSchema)) body: TallyInbound, @Req() req: AgentReq) {
    return this.tally.inbound(req.agent, body);
  }

  @Public()
  @SkipIdempotency()
  @UseGuards(AgentKeyGuard)
  @Post("heartbeat")
  @HttpCode(200)
  heartbeat(@Body(new ZodPipe(tallyHeartbeatSchema)) body: z.infer<typeof tallyHeartbeatSchema>, @Req() req: AgentReq) {
    return this.tally.heartbeat(req.agent, body);
  }
}

const syncList = listQuerySchema.extend({ status: z.string().optional(), entityType: z.string().optional(), branchId: z.string().optional() });

@Controller("tally")
export class TallyAdminController {
  constructor(
    private readonly tally: TallyService,
    private readonly prisma: PrismaService,
  ) {}

  @Get("sync")
  @Perm("tally.read")
  sync(@Query(new ZodPipe(syncList)) q: z.infer<typeof syncList>) {
    return paginate(this.prisma.tallySyncQueue, q, {
      where: { deletedAt: null, ...searchWhere(q.q, ["entityType", "entityId", "lastError"]), ...pickFilters(q, ["status", "entityType", "branchId"]) },
      select: {
        id: true, entityType: true, entityId: true, direction: true, priority: true, status: true, attempts: true,
        nextAttemptAt: true, lastError: true, tallyGuid: true, createdAt: true, updatedAt: true, branchId: true,
      },
      orderBy: [{ createdAt: "desc" }],
    });
  }

  @Get("sync/:id")
  @Perm("tally.read")
  syncItem(@Param("id") id: string) {
    return this.prisma.tallySyncQueue.findUniqueOrThrow({ where: { id } });
  }

  @Post("sync/:id/retry")
  @Perm("tally.write")
  retry(@Param("id") id: string) {
    return this.tally.retry(id);
  }

  @Get("health")
  @Perm("tally.read")
  health() {
    return this.tally.health();
  }

  @Get("agents")
  @Perm("tally.read")
  async agents() {
    const items = await this.prisma.tallyAgent.findMany({
      where: { deletedAt: null },
      select: { id: true, branchId: true, name: true, apiKeyPrefix: true, lastSeenAt: true, lastAlterId: true, tallyVersion: true, companyName: true, tallyRunning: true, isActive: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    return { items, total: items.length, page: 1, pageSize: items.length };
  }

  @Post("agents")
  @Perm("tally.write")
  createAgent(@Body(new ZodPipe(tallyAgentCreateSchema)) body: z.infer<typeof tallyAgentCreateSchema>) {
    return this.tally.createAgent(body.branchId, body.name);
  }

  @Post("agents/:id/rotate")
  @Perm("tally.write")
  rotate(@Param("id") id: string) {
    return this.tally.rotateKey(id);
  }

  @Get("reconciliation")
  @Perm("tally.read")
  reconciliation(@Query(new ZodPipe(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }))) q: { date?: string }) {
    return this.tally.reconciliation(q.date);
  }
}

