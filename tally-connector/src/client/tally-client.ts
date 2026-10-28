import { CONFIG, getTallyUrl } from "../config/env";
import { parseTallyXml, TallyResponseSummary } from "../tally/xml-parser";

export class TallyClient {
  private tallyUrl: string;

  constructor() {
    this.tallyUrl = getTallyUrl();
  }

  /**
   * Health check to see if local TallyPrime HTTP server is running and reachable
   */
  async isOnline(): Promise<boolean> {
    try {
      const pingXml = `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>List of Companies</REPORTNAME>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const res = await fetch(this.tallyUrl, {
        method: "POST",
        headers: { "Content-Type": "text/xml;charset=utf-8" },
        body: pingXml,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return res.ok || res.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * Sends raw XML to local TallyPrime HTTP server and parses response
   */
  async sendXml(xmlContent: string): Promise<{
    rawResponse: string;
    parsed: TallyResponseSummary;
    durationMs: number;
  }> {
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

      const res = await fetch(this.tallyUrl, {
        method: "POST",
        headers: {
          "Content-Type": "text/xml;charset=utf-8",
        },
        body: xmlContent,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const durationMs = Date.now() - startTime;
      const rawText = await res.text();
      const parsed = parseTallyXml(rawText);

      return {
        rawResponse: rawText,
        parsed,
        durationMs,
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      return {
        rawResponse: "",
        parsed: {
          success: false,
          created: 0,
          altered: 0,
          errors: 1,
          errorMessage: `Cannot connect to TallyPrime at ${this.tallyUrl}: ${err.message}`,
        },
        durationMs,
      };
    }
  }
}
