import { Module } from "@nestjs/common";
import { LotsController } from "./lots.controller";
import { LotsService } from "./lots.service";

/** Shade & lot control, stock analysis and the reorder planner. */
@Module({
  controllers: [LotsController],
  providers: [LotsService],
  exports: [LotsService],
})
export class InventoryLotsModule {}
