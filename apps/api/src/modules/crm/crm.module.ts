import { Module } from "@nestjs/common";
import { CrmController } from "./crm.controller";

@Module({
  controllers: [CrmController],
  providers: [],
})
export class CrmModule {}
