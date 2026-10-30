import { Injectable, Logger } from "@nestjs/common";
import { createHash } from "node:crypto";

export interface IrnResult {
  irn: string;
  ackNo: string;
  ackDate: Date;
  signedQrCode: string;
}

export interface EwbResult {
  ewayBillNo: string;
  validUpto: Date | null;
}

/**
 * GSP (GST Suvidha Provider) adapter. Each GSP has its own auth flow, so the real HTTP calls are
 * wired per provider once credentials exist (GSP_* in .env, sandbox first). GSP_PROVIDER=mock
 * returns deterministic fake numbers so the whole flow can be tested without a GSP account.
 */
@Injectable()
export class GspAdapter {
  private readonly log = new Logger(GspAdapter.name);

  get provider(): string {
    return process.env.GSP_PROVIDER || "";
  }

  get configured(): boolean {
    return this.provider === "mock" || !!(this.provider && process.env.GSP_BASE_URL && process.env.GSP_CLIENT_ID);
  }

  async generateIrn(payload: Record<string, unknown>): Promise<IrnResult> {
    if (this.provider === "mock") {
      const irn = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
      return { irn, ackNo: String(Date.now()).slice(-12), ackDate: new Date(), signedQrCode: `MOCK-QR-${irn.slice(0, 16)}` };
    }
    return this.call<IrnResult>("/einvoice/generate", payload);
  }

  async cancelIrn(irn: string, reason: string): Promise<{ cancelled: boolean }> {
    if (this.provider === "mock") return { cancelled: true };
    return this.call("/einvoice/cancel", { Irn: irn, CnlRsn: "2", CnlRem: reason.slice(0, 100) });
  }

  async generateEwayBill(payload: Record<string, unknown>): Promise<EwbResult> {
    if (this.provider === "mock") {
      return { ewayBillNo: `${Date.now()}`.slice(-12), validUpto: new Date(Date.now() + 86_400_000) };
    }
    return this.call<EwbResult>("/ewaybill/generate", payload);
  }

  private async call<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${process.env.GSP_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        client_id: process.env.GSP_CLIENT_ID ?? "",
        client_secret: process.env.GSP_CLIENT_SECRET ?? "",
        gstin: process.env.GSP_GSTIN ?? "",
        user_name: process.env.GSP_USERNAME ?? "",
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      this.log.warn(`GSP ${path} failed: ${res.status} ${text.slice(0, 300)}`);
      throw new Error(`GSP error ${res.status}: ${text.slice(0, 200)}`);
    }
    return JSON.parse(text) as T;
  }
}
