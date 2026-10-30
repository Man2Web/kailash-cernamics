import "reflect-metadata";
import { loadEnv, patchBigIntJson } from "./env";

loadEnv();
patchBigIntJson();

import { Logger } from "@nestjs/common";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { PrismaClient } from "@prisma/client";

/**
 * Background worker (same image as the API, `node dist/worker`). Consumes BullMQ jobs for
 * notifications (WhatsApp/email, Phase 7), PDFs and heavy reports, and runs periodic checks such as
 * the Tally agent heartbeat alert.
 */
const log = new Logger("Worker");
const prisma = new PrismaClient();

async function heartbeatCheck() {
  const minutes = 15;
  const silent = await prisma.tallyAgent.findMany({
    where: { isActive: true, deletedAt: null, OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: new Date(Date.now() - minutes * 60_000) } }] },
  });
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  if (!silent.length || hour < 9 || hour >= 20) return;
  const owners = await prisma.user.findMany({ where: { role: { code: "OWNER" }, isActive: true }, select: { id: true } });
  for (const a of silent) {
    for (const o of owners) {
      const recent = await prisma.notification.findFirst({
        where: { userId: o.id, type: "TALLY_AGENT_SILENT", link: `/settings/tally#${a.id}`, createdAt: { gt: new Date(Date.now() - 60 * 60_000) } },
      });
      if (!recent) {
        await prisma.notification.create({
          data: { userId: o.id, type: "TALLY_AGENT_SILENT", title: `Tally agent "${a.name}" is silent`, body: `No heartbeat for over ${minutes} minutes`, link: `/settings/tally#${a.id}` },
        });
      }
    }
  }
}

async function main() {
  setInterval(() => heartbeatCheck().catch((e) => log.error(e)), 60_000);
  if (!process.env.REDIS_URL) {
    log.warn("REDIS_URL not set: queue processors are idle; periodic checks still run.");
    return;
  }
  const connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
  for (const name of ["notifications", "reports", "pdf"]) {
    new Worker(
      name,
      async (job) => {
        log.log(`Processing ${name}/${job.name} ${job.id}`);
        // Phase 7: WhatsApp Business API / SMTP / PDF rendering processors plug in here.
      },
      { connection, concurrency: 4 },
    );
  }
  log.log("Worker started");
}

void main();
