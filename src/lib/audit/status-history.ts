import db from "@/lib/db/db";
import { randomUUID } from "crypto";

export type DocumentType = "SALES_ORDER" | "SALES_DELIVERY" | "PURCHASE_ORDER";

export interface StatusHistoryEntry {
  id: string;
  documentType: DocumentType;
  documentId: string;
  documentNo?: string;
  oldStatus: string;
  newStatus: string;
  changedByUserId: string;
  changedByName: string;
  changedAt: string; // ISO string
  changedAtFormatted?: string;
  notes?: string;
  actionType?: "CREATED" | "STATUS_UPDATE" | "RECEIVED" | "COMPLETED" | "CANCELLED";
}

export interface DocumentAuditInfo {
  createdById?: string | null;
  createdByName?: string;
  createdAt?: string;
  createdAtFormatted?: string;
  lastUpdatedById?: string | null;
  lastUpdatedByName?: string;
  lastUpdatedAt?: string;
  lastUpdatedAtFormatted?: string;
  completedById?: string | null;
  completedByName?: string;
  completedAt?: string;
  completedAtFormatted?: string;
  receivedById?: string | null;
  receivedByName?: string;
  receivedAt?: string;
  receivedAtFormatted?: string;
  statusHistory: StatusHistoryEntry[];
}

function formatToISTDateTime(dateOrIso?: string | Date | null): string {
  if (!dateOrIso) return "Not recorded";
  const d = dateOrIso instanceof Date ? dateOrIso : new Date(String(dateOrIso));
  if (isNaN(d.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

/**
 * Record a document status transition or audit event
 */
export async function recordDocumentStatusHistory({
  documentType,
  documentId,
  documentNo,
  oldStatus,
  newStatus,
  userId,
  userName,
  notes,
  actionType = "STATUS_UPDATE",
}: {
  documentType: DocumentType;
  documentId: string;
  documentNo?: string;
  oldStatus: string;
  newStatus: string;
  userId: string;
  userName: string;
  notes?: string;
  actionType?: "CREATED" | "STATUS_UPDATE" | "RECEIVED" | "COMPLETED" | "CANCELLED";
}): Promise<StatusHistoryEntry> {
  const now = new Date().toISOString();
  const entryId = randomUUID();

  const entry: StatusHistoryEntry = {
    id: entryId,
    documentType,
    documentId,
    documentNo,
    oldStatus: oldStatus || "NONE",
    newStatus,
    changedByUserId: userId,
    changedByName: userName || "Employee",
    changedAt: now,
    changedAtFormatted: formatToISTDateTime(now),
    notes: notes || "",
    actionType,
  };

  try {
    // 1. Store in activity_logs
    await db.activityLog.create({
      data: {
        id: entryId,
        userId,
        module: `STATUS_${documentType}`,
        description: JSON.stringify(entry),
      },
    });

    // 2. Also log in inventory_transactions for transaction consistency
    await db.inventoryTransaction.create({
      data: {
        docType: `STATUS_${documentType}`,
        docId: documentId,
        transactionNo: documentNo || `AUDIT-${entryId.slice(0, 8)}`,
        remarks: JSON.stringify(entry),
      },
    });
  } catch (err) {
    console.error("Error writing status history:", err);
  }

  return entry;
}

/**
 * Fetch status history for a given document
 */
export async function getDocumentStatusHistory(
  documentType: DocumentType,
  documentId: string
): Promise<StatusHistoryEntry[]> {
  try {
    const data = await db.activityLog.findMany({
      where: { module: `STATUS_${documentType}` },
      orderBy: { timestamp: "asc" },
    });

    const entries: StatusHistoryEntry[] = [];
    for (const row of data) {
      if (!row.description) continue;
      try {
        const meta = JSON.parse(row.description);
        if (meta.documentId === documentId || meta.id === documentId) {
          entries.push({
            id: meta.id || row.id,
            documentType,
            documentId: meta.documentId,
            documentNo: meta.documentNo,
            oldStatus: meta.oldStatus || "NONE",
            newStatus: meta.newStatus || "",
            changedByUserId: meta.changedByUserId || row.userId,
            changedByName: meta.changedByName || "Employee",
            changedAt: meta.changedAt || row.timestamp?.toISOString(),
            changedAtFormatted: formatToISTDateTime(meta.changedAt || row.timestamp?.toISOString()),
            notes: meta.notes || "",
            actionType: meta.actionType || "STATUS_UPDATE",
          });
        }
      } catch {
        // Skip invalid JSON
      }
    }

    return entries;
  } catch (err) {
    console.error("Error fetching status history:", err);
    return [];
  }
}

/**
 * Batch resolve multiple document audit information (Created By, Completed By, Received By, etc.)
 */
export async function batchGetDocumentAuditInfo(
  documentType: DocumentType,
  documentIds: string[]
): Promise<Map<string, DocumentAuditInfo>> {
  const auditMap = new Map<string, DocumentAuditInfo>();
  if (!documentIds || documentIds.length === 0) return auditMap;

  // Initialize defaults
  documentIds.forEach((id) => {
    auditMap.set(id, {
      createdByName: "Not recorded",
      lastUpdatedByName: "Not recorded",
      completedByName: "Not recorded",
      receivedByName: "Not recorded",
      statusHistory: [],
    });
  });

  try {
    const data = await db.activityLog.findMany({
      where: { module: `STATUS_${documentType}` },
      orderBy: { timestamp: "asc" },
    });

    if (data && data.length > 0) {
      for (const row of data) {
        if (!row.description) continue;
        try {
          const meta = JSON.parse(row.description);
          const docId = meta.documentId;
          if (docId && auditMap.has(docId)) {
            const current = auditMap.get(docId)!;
            const entry: StatusHistoryEntry = {
              id: meta.id || row.id,
              documentType,
              documentId: docId,
              documentNo: meta.documentNo,
              oldStatus: meta.oldStatus,
              newStatus: meta.newStatus,
              changedByUserId: meta.changedByUserId || row.userId,
              changedByName: meta.changedByName || "Employee",
              changedAt: meta.changedAt || row.timestamp?.toISOString(),
              changedAtFormatted: formatToISTDateTime(meta.changedAt || row.timestamp?.toISOString()),
              notes: meta.notes || "",
              actionType: meta.actionType,
            };

            current.statusHistory.push(entry);

            if (meta.actionType === "CREATED") {
              current.createdById = meta.changedByUserId || row.userId;
              current.createdByName = meta.changedByName || "Not recorded";
              current.createdAt = meta.changedAt || row.timestamp?.toISOString();
              current.createdAtFormatted = formatToISTDateTime(current.createdAt);
            } else if (!current.createdById) {
              current.createdById = meta.changedByUserId || row.userId;
              current.createdByName = meta.changedByName || "Not recorded";
              current.createdAt = meta.changedAt || row.timestamp?.toISOString();
              current.createdAtFormatted = formatToISTDateTime(current.createdAt);
            }

            if (meta.newStatus === "COMPLETED" || meta.actionType === "COMPLETED") {
              current.completedById = meta.changedByUserId || row.userId;
              current.completedByName = meta.changedByName || "Not recorded";
              current.completedAt = meta.changedAt || row.timestamp?.toISOString();
              current.completedAtFormatted = formatToISTDateTime(current.completedAt);
            }

            if (meta.newStatus === "RECEIVED" || meta.actionType === "RECEIVED" || meta.newStatus === "PARTIALLY_RECEIVED") {
              current.receivedById = meta.changedByUserId || row.userId;
              current.receivedByName = meta.changedByName || "Not recorded";
              current.receivedAt = meta.changedAt || row.timestamp?.toISOString();
              current.receivedAtFormatted = formatToISTDateTime(current.receivedAt);
            }

            current.lastUpdatedById = meta.changedByUserId || row.userId;
            current.lastUpdatedByName = meta.changedByName || "Not recorded";
            current.lastUpdatedAt = meta.changedAt || row.timestamp?.toISOString();
            current.lastUpdatedAtFormatted = formatToISTDateTime(current.lastUpdatedAt);
          }
        } catch {
          // ignore
        }
      }
    }
  } catch (err) {
    console.error("Error in batchGetDocumentAuditInfo:", err);
  }

  return auditMap;
}
