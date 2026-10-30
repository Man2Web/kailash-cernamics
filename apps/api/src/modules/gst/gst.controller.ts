import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post } from "@nestjs/common";
import { z } from "zod";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../core/audit.service";
import { Perm } from "../../common/decorators";
import { ZodPipe } from "../../common/zod.pipe";
import { stampUpdate } from "../../common/context";
import { buildEInvoice, einvoiceApplicable } from "./einvoice.builder";
import { GspAdapter } from "./gsp.adapter";

const ewbSchema = z.object({
  vehicleNo: z.string().trim().min(4).max(15),
  distanceKm: z.coerce.number().int().min(1).max(4000),
  transporterId: z.string().trim().max(15).optional(),
  transporterName: z.string().trim().max(100).optional(),
});

/** Phase 7: e-invoice (IRN + signed QR) and e-way bill through the configured GSP. */
@Controller("gst")
export class GstController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gsp: GspAdapter,
    private readonly audit: AuditService,
  ) {}

  private async load(invoiceId: string) {
    const inv = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, deletedAt: null },
      include: { branch: { include: { company: true } }, party: true, lines: { include: { product: true }, orderBy: { sortOrder: "asc" } } },
    });
    if (!inv) throw new NotFoundException("Invoice not found");
    return inv;
  }

  private payload(inv: Awaited<ReturnType<GstController["load"]>>) {
    if (!inv.number) throw new BadRequestException("Post the invoice first");
    return buildEInvoice({ ...inv, number: inv.number, company: inv.branch.company });
  }

  @Get("einvoice/:invoiceId/payload")
  @Perm("sales.read")
  async preview(@Param("invoiceId") id: string) {
    const inv = await this.load(id);
    return { applicable: einvoiceApplicable(inv), configured: this.gsp.configured, payload: this.payload(inv) };
  }

  @Post("einvoice/:invoiceId/generate")
  @Perm("invoice.write")
  async generate(@Param("invoiceId") id: string) {
    const inv = await this.load(id);
    if (inv.status !== "POSTED") throw new BadRequestException("Only posted invoices get an IRN");
    if (inv.irn) return { irn: inv.irn, ackNo: inv.ackNo, ackDate: inv.ackDate };
    if (!einvoiceApplicable(inv)) throw new BadRequestException("E-invoice applies only to B2B invoices (buyer GSTIN required)");
    if (!this.gsp.configured) throw new BadRequestException("GSP is not configured (set GSP_* in the environment; GSP_PROVIDER=mock for testing)");
    const res = await this.gsp.generateIrn(this.payload(inv));
    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { irn: res.irn, ackNo: res.ackNo, ackDate: res.ackDate, ...stampUpdate() },
    });
    await this.audit.log({ entity: "invoice", entityId: id, action: "irn_generated", before: { irn: null }, after: { irn: res.irn, ackNo: res.ackNo } });
    return { irn: updated.irn, ackNo: updated.ackNo, ackDate: updated.ackDate, signedQrCode: res.signedQrCode };
  }

  @Post("ewaybill/:invoiceId")
  @Perm("dispatch.write")
  async ewaybill(@Param("invoiceId") id: string, @Body(new ZodPipe(ewbSchema)) body: z.infer<typeof ewbSchema>) {
    const inv = await this.load(id);
    if (inv.status !== "POSTED") throw new BadRequestException("Only posted invoices get an e-way bill");
    if (!this.gsp.configured) throw new BadRequestException("GSP is not configured");
    const res = await this.gsp.generateEwayBill({ Irn: inv.irn, Distance: body.distanceKm, TransMode: "1", VehNo: body.vehicleNo, VehType: "R", TransId: body.transporterId, TransName: body.transporterName });
    await this.prisma.invoice.update({ where: { id }, data: { ewayBillNo: res.ewayBillNo, ...stampUpdate() } });
    await this.audit.log({ entity: "invoice", entityId: id, action: "ewaybill_generated", after: res });
    return res;
  }
}
