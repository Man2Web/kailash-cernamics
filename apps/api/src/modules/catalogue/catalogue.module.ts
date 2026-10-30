import { Module } from "@nestjs/common";
import { brandSchema, categorySchema, colorSchema, finishSchema, seriesSchema, sizeSchema } from "@gc/shared";
import { crudController } from "../../common/crud.factory";
import { ProductsController } from "./products.controller";
import { PricesController } from "./prices.controller";
import { ImportController } from "./import.controller";

// Simple catalogue masters use the generic CRUD controller (search, filters, audit, soft delete).
const BrandController = crudController({
  path: "brands", model: "brand", entity: "brand", read: "catalogue.read", write: "catalogue.write",
  createSchema: brandSchema, searchFields: ["name", "code"], filterFields: ["isActive"],
});
const CategoryController = crudController({
  path: "categories", model: "category", entity: "category", read: "catalogue.read", write: "catalogue.write",
  createSchema: categorySchema, searchFields: ["name"], filterFields: ["type", "isActive"],
});
const SeriesController = crudController({
  path: "series", model: "series", entity: "series", read: "catalogue.read", write: "catalogue.write",
  createSchema: seriesSchema, searchFields: ["name", "brand.name"], filterFields: ["brandId", "isActive"],
  include: { brand: { select: { id: true, name: true } } },
});
const SizeController = crudController({
  path: "sizes", model: "size", entity: "size", read: "catalogue.read", write: "catalogue.write",
  createSchema: sizeSchema, searchFields: ["name"], filterFields: ["isActive"],
});
const FinishController = crudController({
  path: "finishes", model: "finish", entity: "finish", read: "catalogue.read", write: "catalogue.write",
  createSchema: finishSchema, searchFields: ["name"], filterFields: ["isActive"],
});
const ColorController = crudController({
  path: "colors", model: "color", entity: "color", read: "catalogue.read", write: "catalogue.write",
  createSchema: colorSchema, searchFields: ["name"], filterFields: ["isActive"],
});

@Module({
  controllers: [
    BrandController,
    CategoryController,
    SeriesController,
    SizeController,
    FinishController,
    ColorController,
    ProductsController,
    PricesController,
    ImportController,
  ],
  providers: [],
})
export class CatalogueModule {}
