import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import type { NextFunction, Request, Response } from "express";
import { PrismaModule } from "./prisma/prisma.service";
import { CoreModule } from "./core/core.module";
import { AuthModule } from "./auth/auth.module";
import { AuthGuard } from "./common/guards";
import { IdempotencyInterceptor } from "./common/idempotency.interceptor";
import { AllExceptionsFilter } from "./common/exception.filter";
import { requestContext } from "./common/context";
import { OrgModule } from "./modules/org/org.module";
import { UsersModule } from "./modules/users/users.module";
import { OfficeModule } from "./modules/office/office.module";
import { CatalogueModule } from "./modules/catalogue/catalogue.module";
import { PartiesModule } from "./modules/parties/parties.module";
import { InventoryModule } from "./modules/inventory/inventory.module";
import { PurchaseModule } from "./modules/purchase/purchase.module";
import { SalesModule } from "./modules/sales/sales.module";
import { AccountsModule } from "./modules/accounts/accounts.module";
import { CrmModule } from "./modules/crm/crm.module";
import { TallyModule } from "./modules/tally/tally.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { GstModule } from "./modules/gst/gst.module";
import { GoliveModule } from "./modules/golive/golive.module";

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({ global: true }),
    ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: 600 }]),
    CoreModule,
    AuthModule,
    OrgModule,
    UsersModule,
    OfficeModule,
    CatalogueModule,
    PartiesModule,
    InventoryModule,
    PurchaseModule,
    SalesModule,
    AccountsModule,
    CrmModule,
    TallyModule,
    ReportsModule,
    GstModule,
    GoliveModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Per-request context (user, branch, ip) for audit logging and createdBy/updatedBy stamps.
    consumer
      .apply((req: Request, _res: Response, next: NextFunction) => {
        const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() || req.ip;
        requestContext.run({ ip }, () => next());
      })
      .forRoutes("*path");
  }
}
