import { CONFIG } from "../config/env";

export interface QueueJob {
  id: string;
  entityType: string;
  entityId: string;
  entityCode?: string | null;
  entityName?: string | null;
  operation: string;
  direction: string;
  payload: any;
  xmlRequest?: string | null;
  retryCount: number;
}

export class ErpClient {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = CONFIG.erpBaseUrl;
    this.apiKey = CONFIG.bridgeApiKey;
  }

  /**
   * Pings ERP to verify bridge authentication and handshake
   */
  async ping(): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tally/connection-test`, {
        method: "GET",
        headers: {
          "x-tally-bridge-key": this.apiKey,
        },
      });

      if (!res.ok) {
        const errorText = await res.text();
        return { success: false, error: `ERP Auth Failed (${res.status}): ${errorText}` };
      }

      const data = await res.json();
      return { success: true, message: data.message };
    } catch (err: any) {
      return { success: false, error: `Network error connecting to ERP: ${err.message}` };
    }
  }

  /**
   * Claims next batch of pending sync jobs from ERP
   */
  async claimJobs(limit = CONFIG.batchSize): Promise<QueueJob[]> {
    try {
      const url = `${this.baseUrl}/api/tally/sync?limit=${limit}&workerId=${encodeURIComponent(CONFIG.workerId)}`;
      const res = await fetch(url, {
        method: "GET",
        headers: {
          "x-tally-bridge-key": this.apiKey,
        },
      });

      if (!res.ok) {
        console.error(`[ERP Client] Failed to claim jobs: HTTP ${res.status}`);
        return [];
      }

      const data = await res.json();
      return data.jobs || [];
    } catch (err: any) {
      console.error(`[ERP Client] Error fetching jobs from ERP:`, err.message);
      return [];
    }
  }

  /**
   * Reports execution result of a sync job back to ERP
   */
  async submitResult(result: {
    jobId: string;
    success: boolean;
    tallyGuid?: string;
    tallyName?: string;
    tallyVoucherNo?: string;
    requestXml?: string;
    responseXml?: string;
    responseJson?: any;
    errorMessage?: string;
    durationMs?: number;
  }): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tally/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tally-bridge-key": this.apiKey,
        },
        body: JSON.stringify(result),
      });

      if (!res.ok) {
        console.error(`[ERP Client] Failed to submit result for job ${result.jobId}: HTTP ${res.status}`);
        return false;
      }

      return true;
    } catch (err: any) {
      console.error(`[ERP Client] Error reporting result for job ${result.jobId}:`, err.message);
      return false;
    }
  }
}
