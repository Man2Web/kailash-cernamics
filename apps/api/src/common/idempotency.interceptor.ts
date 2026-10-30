import { BadRequestException, CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request, Response } from "express";
import { from, Observable, of } from "rxjs";
import { mergeMap } from "rxjs/operators";
import { PrismaService } from "../prisma/prisma.service";
import { IS_PUBLIC, SKIP_IDEMPOTENCY } from "./decorators";
import { ctx } from "./context";

const WRITE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Every write endpoint is idempotent via the Idempotency-Key header: the first successful response
 * is stored and replayed for retries with the same key (double-clicks, flaky mobile networks).
 * The custom header also forces a CORS preflight, which protects cookie auth from CSRF.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    if (!WRITE.has(req.method)) return next.handle();
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_IDEMPOTENCY, [context.getHandler(), context.getClass()]);
    if (skip) return next.handle();

    const key = req.headers["idempotency-key"] as string | undefined;
    if (!key || key.length < 8 || key.length > 100) throw new BadRequestException("Idempotency-Key header is required");
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    const scope = ctx().user?.id ?? ctx().agentId ?? (isPublic ? "public" : "anon");
    const path = req.originalUrl.split("?")[0];

    const existing = await this.prisma.idempotencyKey.findUnique({ where: { scope_key: { scope, key } } });
    if (existing) {
      if (existing.method !== req.method || existing.path !== path) {
        throw new BadRequestException("Idempotency-Key was already used for a different request");
      }
      res.status(existing.statusCode);
      res.setHeader("Idempotent-Replay", "true");
      return of(existing.response);
    }

    return next.handle().pipe(
      mergeMap((body) =>
        from(
          (async () => {
            const json = body === undefined ? null : JSON.parse(JSON.stringify(body));
            try {
              await this.prisma.idempotencyKey.create({
                data: { scope, key, method: req.method, path, statusCode: res.statusCode || 201, response: json ?? undefined },
              });
            } catch {
              // concurrent duplicate: the first writer wins; this response is still correct
            }
            return body;
          })(),
        ),
      ),
    );
  }
}
