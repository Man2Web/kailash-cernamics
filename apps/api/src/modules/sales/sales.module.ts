import { Module } from "@nestjs/common";
import {
  DispatchController,
  InvoicesController,
  QuotationsController,
  ReturnsController,
  SalesLookupController,
  SalesOrdersController,
} from "./sales.controllers";
import { QuotationService } from "./quotation.service";
import { OrderService } from "./order.service";
import { InvoiceService } from "./invoice.service";
import { DispatchService } from "./dispatch.service";
import { ReturnService } from "./return.service";

@Module({
  controllers: [QuotationsController, SalesOrdersController, InvoicesController, DispatchController, ReturnsController, SalesLookupController],
  providers: [QuotationService, OrderService, InvoiceService, DispatchService, ReturnService],
  exports: [InvoiceService, OrderService],
})
export class SalesModule {}
