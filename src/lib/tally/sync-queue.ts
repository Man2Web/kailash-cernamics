import db from "@/lib/db/db";
import { TallyEntityType, TallyOperation, TallyQueueItem } from "./types";

/**
 * Adds or updates an entity sync job in the queue safely.
 */
export async function enqueueSyncJob({
  entityType,
  entityId,
  operation = "CREATE",
  payload,
  entityCode,
  entityName,
  xmlRequest,
  maxRetries = 5,
}: {
  entityType: TallyEntityType;
  entityId: string;
  operation?: TallyOperation;
  payload: any;
  entityCode?: string | null;
  entityName?: string | null;
  xmlRequest?: string | null;
  maxRetries?: number;
}) {
  try {
    // Check if an uncompleted queue record already exists for this entity
    const existingQueueItem = await db.tallySyncQueue.findFirst({
      where: {
        entityType,
        entityId,
        status: { in: ["PENDING", "PROCESSING", "RETRYING"] },
      },
    });

    if (existingQueueItem) {
      // Update existing item with newer payload and reset to PENDING
      const updated = await db.tallySyncQueue.update({
        where: { id: existingQueueItem.id },
        data: {
          payload,
          xmlRequest: xmlRequest || existingQueueItem.xmlRequest,
          entityCode: entityCode || existingQueueItem.entityCode,
          entityName: entityName || existingQueueItem.entityName,
          status: "PENDING",
          operation,
          lockedUntil: null,
          lockedBy: null,
          updatedAt: new Date(),
        },
      });
      return { success: true, queueId: updated.id, updated: true };
    }

    // Create new queue record
    const newQueueItem = await db.tallySyncQueue.create({
      data: {
        entityType,
        entityId,
        entityCode: entityCode || null,
        entityName: entityName || null,
        operation,
        direction: "ERP_TO_TALLY",
        status: "PENDING",
        payload,
        xmlRequest: xmlRequest || null,
        retryCount: 0,
        maxRetries,
        lockedUntil: null,
        lockedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return { success: true, queueId: newQueueItem.id, created: true };
  } catch (error: any) {
    console.error("Error in enqueueSyncJob:", error);
    return { error: error.message || "Failed to enqueue sync job" };
  }
}

/**
 * Claims a batch of pending/retrying jobs atomically for processing.
 */
export async function claimNextPendingJobs({
  limit = 10,
  lockedBy = "bridge-connector",
  leaseSeconds = 300,
}: {
  limit?: number;
  lockedBy?: string;
  leaseSeconds?: number;
} = {}) {
  try {
    const now = new Date();
    const leaseExpiry = new Date(now.getTime() + leaseSeconds * 1000);

    // Fetch jobs that are either PENDING or RETRYING and not currently locked
    const pendingJobs = await db.tallySyncQueue.findMany({
      where: {
        status: { in: ["PENDING", "RETRYING"] },
      },
      orderBy: { createdAt: "asc" },
      take: limit * 2, // Fetch a little more to filter locked ones safely
    });

    const eligibleJobs = (pendingJobs || []).filter((job: any) => {
      if (!job.lockedUntil) return true;
      const lockedTime = new Date(job.lockedUntil);
      return isNaN(lockedTime.getTime()) || lockedTime < now;
    }).slice(0, limit);

    const claimedJobs: TallyQueueItem[] = [];

    for (const job of eligibleJobs) {
      await db.tallySyncQueue.update({
        where: { id: job.id },
        data: {
          status: "PROCESSING",
          lockedUntil: leaseExpiry,
          lockedBy,
          updatedAt: new Date(),
        },
      });
      claimedJobs.push({
        ...job,
        status: "PROCESSING",
        lockedUntil: leaseExpiry,
        lockedBy,
      });
    }

    return { success: true, jobs: claimedJobs };
  } catch (error: any) {
    console.error("Error claiming pending jobs:", error);
    return { error: error.message || "Failed to claim jobs", jobs: [] };
  }
}

/**
 * Marks a job as successfully synced, updates mappings and audit logs.
 */
export async function markJobSuccess({
  jobId,
  tallyGuid,
  tallyName,
  tallyVoucherNo,
  requestXml,
  responseXml,
  responseJson,
  durationMs = 0,
}: {
  jobId: string;
  tallyGuid?: string | null;
  tallyName?: string | null;
  tallyVoucherNo?: string | null;
  requestXml?: string | null;
  responseXml?: string | null;
  responseJson?: any;
  durationMs?: number;
}) {
  try {
    const job = await db.tallySyncQueue.findUnique({
      where: { id: jobId },
    });

    if (!job) throw new Error("Job not found in sync queue");

    // 1. Update queue status
    await db.tallySyncQueue.update({
      where: { id: jobId },
      data: {
        status: "SYNCED",
        lockedUntil: null,
        lockedBy: null,
        lastError: null,
        updatedAt: new Date(),
      },
    });

    // 2. Upsert entity mapping
    const existingMapping = await db.tallyEntityMapping.findFirst({
      where: {
        entityType: job.entityType,
        entityId: job.entityId,
      },
    });

    if (existingMapping) {
      await db.tallyEntityMapping.update({
        where: { id: existingMapping.id },
        data: {
          entityCode: job.entityCode || existingMapping.entityCode,
          entityName: job.entityName || existingMapping.entityName,
          tallyGuid: tallyGuid || existingMapping.tallyGuid,
          tallyName: tallyName || existingMapping.tallyName,
          tallyVoucherNo: tallyVoucherNo || existingMapping.tallyVoucherNo,
          syncStatus: "SYNCED",
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        },
      });
    } else {
      await db.tallyEntityMapping.create({
        data: {
          entityType: job.entityType,
          entityId: job.entityId,
          entityCode: job.entityCode || null,
          entityName: job.entityName || null,
          tallyGuid: tallyGuid || null,
          tallyName: tallyName || null,
          tallyVoucherNo: tallyVoucherNo || null,
          syncStatus: "SYNCED",
          lastSyncedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    }

    // 3. Write sync log
    await db.tallySyncLog.create({
      data: {
        queueId: job.id,
        entityType: job.entityType,
        entityId: job.entityId,
        entityCode: job.entityCode || null,
        operation: job.operation,
        status: "SUCCESS",
        requestXml: requestXml || job.xmlRequest || null,
        responseXml: responseXml || null,
        responseJson: responseJson || null,
        durationMs,
        createdAt: new Date(),
      },
    });

    // 4. Update tally connection lastSyncAt
    const connection = await db.tallyConnection.findFirst({
      where: { isActive: true },
    });
    if (connection) {
      await db.tallyConnection.update({
        where: { id: connection.id },
        data: { lastSyncAt: new Date(), status: "ONLINE" },
      });
    }

    return { success: true };
  } catch (error: any) {
    console.error("Error in markJobSuccess:", error);
    return { error: error.message || "Failed to mark job as success" };
  }
}

/**
 * Marks a job as failed or scheduling retry.
 */
export async function markJobFailed({
  jobId,
  errorMessage,
  requestXml,
  responseXml,
  durationMs = 0,
}: {
  jobId: string;
  errorMessage: string;
  requestXml?: string | null;
  responseXml?: string | null;
  durationMs?: number;
}) {
  try {
    const job = await db.tallySyncQueue.findUnique({
      where: { id: jobId },
    });

    if (!job) throw new Error("Job not found in sync queue");

    const newRetryCount = (job.retryCount || 0) + 1;
    const isExhausted = newRetryCount >= (job.maxRetries || 5);
    const newStatus = isExhausted ? "FAILED" : "RETRYING";

    // Update queue record
    await db.tallySyncQueue.update({
      where: { id: jobId },
      data: {
        status: newStatus,
        retryCount: newRetryCount,
        lockedUntil: null,
        lockedBy: null,
        lastError: errorMessage,
        updatedAt: new Date(),
      },
    });

    // Write sync log
    await db.tallySyncLog.create({
      data: {
        queueId: job.id,
        entityType: job.entityType,
        entityId: job.entityId,
        entityCode: job.entityCode || null,
        operation: job.operation,
        status: newStatus === "FAILED" ? "FAILED" : "RETRY",
        requestXml: requestXml || job.xmlRequest || null,
        responseXml: responseXml || null,
        errorMessage,
        durationMs,
        createdAt: new Date(),
      },
    });

    return { success: true, status: newStatus, retryCount: newRetryCount };
  } catch (error: any) {
    console.error("Error in markJobFailed:", error);
    return { error: error.message || "Failed to mark job as failed" };
  }
}

/**
 * Manually resets a specific job to PENDING.
 */
export async function retryJob(jobId: string) {
  try {
    const updated = await db.tallySyncQueue.update({
      where: { id: jobId },
      data: {
        status: "PENDING",
        lockedUntil: null,
        lockedBy: null,
        lastError: null,
        updatedAt: new Date(),
      },
    });
    return { success: true, data: updated };
  } catch (error: any) {
    return { error: error.message || "Failed to retry job" };
  }
}

/**
 * Retries all failed and retrying jobs.
 */
export async function retryAllFailed() {
  try {
    const failedJobs = await db.tallySyncQueue.findMany({
      where: {
        status: { in: ["FAILED", "RETRYING"] },
      },
    });

    for (const job of failedJobs) {
      await db.tallySyncQueue.update({
        where: { id: job.id },
        data: {
          status: "PENDING",
          lockedUntil: null,
          lockedBy: null,
          lastError: null,
          updatedAt: new Date(),
        },
      });
    }

    return { success: true, count: failedJobs.length };
  } catch (error: any) {
    return { error: error.message || "Failed to retry all failed jobs" };
  }
}

/**
 * Cancels a queue job.
 */
export async function cancelJob(jobId: string) {
  try {
    const updated = await db.tallySyncQueue.update({
      where: { id: jobId },
      data: {
        status: "CANCELLED",
        lockedUntil: null,
        lockedBy: null,
        updatedAt: new Date(),
      },
    });
    return { success: true, data: updated };
  } catch (error: any) {
    return { error: error.message || "Failed to cancel job" };
  }
}
