import { ErpClient, QueueJob } from "../client/erp-client";
import { TallyClient } from "../client/tally-client";
import { CONFIG } from "../config/env";

export class SyncPoller {
  private erpClient: ErpClient;
  private tallyClient: TallyClient;
  private isRunning: boolean = false;
  private isProcessing: boolean = false;

  constructor() {
    this.erpClient = new ErpClient();
    this.tallyClient = new TallyClient();
  }

  async start() {
    this.isRunning = true;
    console.log(`[Bridge Poller] Starting Tally Sync Poller...`);
    console.log(`[Bridge Poller] ERP Endpoint: ${CONFIG.erpBaseUrl}`);
    console.log(`[Bridge Poller] Tally Host: ${CONFIG.tallyHost}:${CONFIG.tallyPort}`);
    console.log(`[Bridge Poller] Poll Interval: ${CONFIG.pollIntervalMs / 1000}s`);

    // Initial handshake with ERP
    const handshake = await this.erpClient.ping();
    if (handshake.success) {
      console.log(`[Bridge Poller] [SUCCESS] ERP Handshake succeeded: ${handshake.message}`);
    } else {
      console.warn(`[Bridge Poller] [WARNING] ERP Handshake issue: ${handshake.error}`);
    }

    this.pollLoop();
  }

  stop() {
    this.isRunning = false;
    console.log(`[Bridge Poller] Stopping poller gracefully...`);
  }

  private async pollLoop() {
    while (this.isRunning) {
      try {
        if (!this.isProcessing) {
          await this.processCycle();
        }
      } catch (err: any) {
        console.error(`[Bridge Poller] Cycle error:`, err.message);
      }

      await new Promise((resolve) => setTimeout(resolve, CONFIG.pollIntervalMs));
    }
  }

  private async processCycle() {
    this.isProcessing = true;

    try {
      // 1. Check if TallyPrime is online
      const tallyOnline = await this.tallyClient.isOnline();
      if (!tallyOnline) {
        console.log(
          `[Bridge Poller] [TALLY OFFLINE] TallyPrime is not responding on port ${CONFIG.tallyPort}. Will check again in ${CONFIG.pollIntervalMs / 1000}s.`
        );
        this.isProcessing = false;
        return;
      }

      // 2. Claim pending jobs from ERP
      const jobs = await this.erpClient.claimJobs();
      if (jobs.length === 0) {
        // No pending jobs
        this.isProcessing = false;
        return;
      }

      console.log(`[Bridge Poller] Claimed ${jobs.length} pending job(s) from ERP. Processing...`);

      // 3. Process each job sequentially to preserve ordering & idempotency
      for (const job of jobs) {
        await this.processSingleJob(job);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async processSingleJob(job: QueueJob) {
    console.log(`[Bridge Poller] -> Processing Job ${job.id} [${job.entityType}] ${job.entityCode || ""}`);

    const xmlRequest = job.xmlRequest;
    if (!xmlRequest) {
      console.error(`[Bridge Poller] Missing XML request payload for job ${job.id}`);
      await this.erpClient.submitResult({
        jobId: job.id,
        success: false,
        errorMessage: "No XML request generated for this entity.",
      });
      return;
    }

    // Send XML to Tally
    const { rawResponse, parsed, durationMs } = await this.tallyClient.sendXml(xmlRequest);

    if (parsed.success) {
      console.log(
        `[Bridge Poller] [SUCCESS] Synced ${job.entityType} ${job.entityCode || ""}. Created: ${parsed.created}, Altered: ${parsed.altered} (${durationMs}ms)`
      );

      await this.erpClient.submitResult({
        jobId: job.id,
        success: true,
        tallyGuid: parsed.guid,
        tallyName: job.entityName || undefined,
        tallyVoucherNo: parsed.lastVchId || job.entityCode || undefined,
        requestXml: xmlRequest,
        responseXml: rawResponse,
        durationMs,
      });
    } else {
      console.error(
        `[Bridge Poller] [FAILED] Sync failed for ${job.entityType} ${job.entityCode || ""}: ${parsed.errorMessage}`
      );

      await this.erpClient.submitResult({
        jobId: job.id,
        success: false,
        requestXml: xmlRequest,
        responseXml: rawResponse,
        errorMessage: parsed.errorMessage || "Unknown error reported by Tally",
        durationMs,
      });
    }
  }
}
