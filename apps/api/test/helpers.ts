import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/prisma/prisma.service";
import { invalidateUserCache } from "../src/common/guards";
import { seedBase, SEED_PASSWORD } from "../src/seed/base";

export { SEED_PASSWORD };

export interface TestCtx {
  app: INestApplication;
  prisma: PrismaService;
  base: Awaited<ReturnType<typeof seedBase>>;
}

/** Empty every table (keeps migrations), then seed the base org/roles/users. */
export async function resetDb(prisma: PrismaClient) {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  invalidateUserCache();
  return seedBase(prisma);
}

export async function createTestApp(): Promise<TestCtx> {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = mod.createNestApplication({ logger: ["error"] });
  configureApp(app);
  await app.init();
  const prisma = app.get(PrismaService);
  const base = await resetDb(prisma);
  return { app, prisma, base };
}

/** Logged-in supertest agent; every write gets a fresh Idempotency-Key unless one is given. */
export async function loginAs(app: INestApplication, email = "admin@kailashceramics.com") {
  const agent = request.agent(app.getHttpServer());
  const res = await agent.post("/api/auth/login").send({ email, password: SEED_PASSWORD });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  const write = (method: "post" | "put" | "patch" | "delete", url: string, body?: unknown, key: string = randomUUID()) =>
    agent[method](url).set("Idempotency-Key", key).send(body as object);
  return {
    agent,
    user: res.body,
    get: (url: string) => agent.get(url),
    post: (url: string, body?: unknown, key?: string) => write("post", url, body, key),
    put: (url: string, body?: unknown, key?: string) => write("put", url, body, key),
    patch: (url: string, body?: unknown, key?: string) => write("patch", url, body, key),
    del: (url: string, key?: string) => write("delete", url, undefined, key),
  };
}
