import { Injectable, Logger } from "@nestjs/common";

export type WhatsAppTemplate = "quotation_share" | "invoice_share" | "payment_reminder" | "approval_request";

/**
 * WhatsApp Business API sender. With WHATSAPP_* configured it sends approved templates; without it
 * callers fall back to a wa.me share link that staff open on their phone.
 */
@Injectable()
export class WhatsAppService {
  private readonly log = new Logger(WhatsAppService.name);

  get configured(): boolean {
    return !!(process.env.WHATSAPP_API_URL && process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
  }

  /** wa.me link with a pre-filled message; Indian 10-digit numbers get the 91 prefix. */
  link(phone: string | null | undefined, text: string): string {
    const digits = (phone ?? "").replace(/\D/g, "");
    const to = digits.length === 10 ? `91${digits}` : digits;
    return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
  }

  async sendTemplate(phone: string, template: WhatsAppTemplate, params: string[]): Promise<{ sent: boolean; link?: string }> {
    if (!this.configured) return { sent: false, link: this.link(phone, params.join(" ")) };
    const digits = phone.replace(/\D/g, "");
    const res = await fetch(`${process.env.WHATSAPP_API_URL}/${process.env.WHATSAPP_PHONE_ID}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: digits.length === 10 ? `91${digits}` : digits,
        type: "template",
        template: {
          name: template,
          language: { code: "en" },
          components: [{ type: "body", parameters: params.map((p) => ({ type: "text", text: p })) }],
        },
      }),
    });
    if (!res.ok) {
      this.log.warn(`WhatsApp send failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
      return { sent: false, link: this.link(phone, params.join(" ")) };
    }
    return { sent: true };
  }
}
