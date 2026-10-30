import { Global, Module } from "@nestjs/common";
import { GstController } from "./gst.controller";
import { GspAdapter } from "./gsp.adapter";
import { WhatsAppService } from "./whatsapp.service";

/** GST compliance (e-invoice, e-way bill) and outbound messaging adapters (Phase 7). */
@Global()
@Module({ controllers: [GstController], providers: [GspAdapter, WhatsAppService], exports: [GspAdapter, WhatsAppService] })
export class GstModule {}
