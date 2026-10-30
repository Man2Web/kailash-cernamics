import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Response } from "express";

/** Uniform error body { statusCode, message, issues? }; maps common Prisma errors to 4xx. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger("Error");

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const payload = typeof body === "string" ? { message: body } : (body as Record<string, unknown>);
      res.status(status).json({ statusCode: status, ...payload });
      return;
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === "P2002") {
        const target = (exception.meta?.target as string[] | string | undefined) ?? "";
        res.status(HttpStatus.CONFLICT).json({ statusCode: 409, message: `Already exists (${Array.isArray(target) ? target.join(", ") : target})` });
        return;
      }
      if (exception.code === "P2025") {
        res.status(HttpStatus.NOT_FOUND).json({ statusCode: 404, message: "Record not found" });
        return;
      }
      if (exception.code === "P2003") {
        res.status(HttpStatus.BAD_REQUEST).json({ statusCode: 400, message: "Linked record not found or still in use" });
        return;
      }
    }
    this.log.error(exception instanceof Error ? exception.stack : String(exception));
    res.status(500).json({ statusCode: 500, message: "Something went wrong. Please try again." });
  }
}
