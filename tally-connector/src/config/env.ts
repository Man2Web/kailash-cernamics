import * as dotenv from "dotenv";
dotenv.config();

export const CONFIG = {
  erpBaseUrl: (process.env.ERP_API_BASE_URL || "http://localhost:3000").replace(/\/$/, ""),
  bridgeApiKey: process.env.TALLY_BRIDGE_API_KEY || "tally-bridge-secret-key-2026",
  tallyHost: process.env.TALLY_HOST || "localhost",
  tallyPort: parseInt(process.env.TALLY_PORT || "9000", 10),
  tallyProtocol: process.env.TALLY_PROTOCOL || "http",
  tallyCompanyName: process.env.TALLY_COMPANY_NAME || "Default Company",
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_SECONDS || "15", 10) * 1000,
  batchSize: parseInt(process.env.BATCH_SIZE || "10", 10),
  workerId: process.env.WORKER_ID || `win-bridge-${process.pid}`,
};

export function getTallyUrl(): string {
  return `${CONFIG.tallyProtocol}://${CONFIG.tallyHost}:${CONFIG.tallyPort}`;
}
