import { Module } from "@nestjs/common";
import { SamplesController } from "./samples.controller";
import { SamplesService } from "./samples.service";

/** Sanitary colour-variant stock, samples out, showroom display boards and supplier breakage claims. */
@Module({
  controllers: [SamplesController],
  providers: [SamplesService],
})
export class InventorySamplesModule {}
