import { Module } from "@nestjs/common";
import { AgentKeyGuard, TallyAdminController, TallyAgentController } from "./tally.controller";
import { TallyService } from "./tally.service";

@Module({
  controllers: [TallyAgentController, TallyAdminController],
  providers: [TallyService, AgentKeyGuard],
  exports: [TallyService],
})
export class TallyModule {}
