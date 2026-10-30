import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
import IORedis from "ioredis";

export const QUEUE_NAMES = ["notifications", "reports", "pdf"] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

/**
 * BullMQ producer for background jobs (WhatsApp/email, PDFs, heavy reports). The worker container
 * (src/worker.ts) consumes them. Without REDIS_URL (local dev) jobs are logged and skipped.
 * Tally sync does NOT use this: it's a DB queue pulled by the agent.
 */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly log = new Logger(QueueService.name);
  private queues = new Map<string, Queue>();
  private connection: IORedis | null = null;

  constructor() {
    if (process.env.REDIS_URL) {
      this.connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
    }
  }

  async add(name: QueueName, jobName: string, data: unknown) {
    if (!this.connection) {
      this.log.debug(`REDIS_URL not set; skipped job ${name}/${jobName}`);
      return null;
    }
    let q = this.queues.get(name);
    if (!q) {
      q = new Queue(name, { connection: this.connection });
      this.queues.set(name, q);
    }
    return q.add(jobName, data, { attempts: 3, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: 1000 });
  }

  async onModuleDestroy() {
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    this.connection?.disconnect();
  }
}
