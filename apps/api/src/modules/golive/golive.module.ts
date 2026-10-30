import { Module } from "@nestjs/common";
import { GoliveController } from "./golive.controller";
import { GoliveService } from "./golive.service";

@Module({ controllers: [GoliveController], providers: [GoliveService] })
export class GoliveModule {}
