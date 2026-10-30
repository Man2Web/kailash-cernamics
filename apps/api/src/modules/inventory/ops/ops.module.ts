import { Module } from "@nestjs/common";
import { OpsController } from "./ops.controller";
import { CountsService } from "./counts.service";
import { LabelsService } from "./labels.service";

/** Godown operations: physical stock counts, labels/scan (inter-branch transit lives in InventoryService). */
@Module({
  controllers: [OpsController],
  providers: [CountsService, LabelsService],
})
export class InventoryOpsModule {}
