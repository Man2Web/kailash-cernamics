import type { INestApplication } from "@nestjs/common";
import cookieParser from "cookie-parser";

/** Shared app setup for main.ts and e2e tests. */
export function configureApp(app: INestApplication) {
  app.setGlobalPrefix("api");
  app.use(cookieParser());
  const express = app.getHttpAdapter().getInstance();
  // Hops in front of the API: Next.js locally (1); Traefik + Next.js on Coolify (2). Getting this
  // right keeps req.ip the real client IP for login rate limiting and the audit log.
  express.set("trust proxy", Number(process.env.TRUST_PROXY ?? 1));
  express.disable("x-powered-by");
  return app;
}
