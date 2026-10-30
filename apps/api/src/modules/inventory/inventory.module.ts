import { Module } from "@nestjs/common";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";
import { InventoryLotsModule } from "./lots/lots.module";
import { InventoryOpsModule } from "./ops/ops.module";
import { InventorySamplesModule } from "./samples/samples.module";

// Industry inventory features live in sub-modules: lots (shade/lot finder, shade stock, site
// history, analysis, reorder), ops (stock counts, labels/scan, inter-branch transit) and samples
// (sanitary variants, samples out, display boards, supplier breakage claims).
@Module({
  imports: [InventoryLotsModule, InventoryOpsModule, InventorySamplesModule],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
