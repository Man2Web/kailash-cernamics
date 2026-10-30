import { Global, Module } from "@nestjs/common";
import { AuditService } from "./audit.service";
import { LedgerService } from "./ledger.service";
import { NumberingService } from "./numbering.service";
import { ApprovalService } from "./approval.service";
import { CreditService } from "./credit.service";
import { TallyQueueService } from "./tally-queue.service";
import { StorageService } from "./storage.service";
import { SettingsService } from "./settings.service";
import { QueueService } from "./queue.service";
import { CoreController } from "./core.controller";

const services = [
  AuditService,
  LedgerService,
  NumberingService,
  ApprovalService,
  CreditService,
  TallyQueueService,
  StorageService,
  SettingsService,
  QueueService,
];

/** Cross-module services. Global so every feature module can inject them. */
@Global()
@Module({ providers: services, exports: services, controllers: [CoreController] })
export class CoreModule {}
