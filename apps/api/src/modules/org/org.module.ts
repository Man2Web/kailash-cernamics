import { Module } from "@nestjs/common";
import { orgGodownSchema, orgRackSchema, orgVehicleSchema } from "@gc/shared";
import { crudController } from "../../common/crud.factory";
import { OrgController } from "./org.controller";

const GodownController = crudController({
  path: "godowns", model: "godown", entity: "godown", read: "org.read", write: "org.write",
  createSchema: orgGodownSchema, searchFields: ["name", "code"], filterFields: ["branchId", "isDisplay", "isActive"],
  include: { branch: { select: { id: true, code: true, name: true } } }, orderBy: { code: "asc" },
});
const RackController = crudController({
  path: "racks", model: "rack", entity: "rack", read: "org.read", write: "org.write",
  createSchema: orgRackSchema, searchFields: ["code", "name"], filterFields: ["godownId", "isActive"],
  include: { godown: { select: { id: true, code: true, name: true } } }, orderBy: { code: "asc" },
});
const VehicleController = crudController({
  path: "vehicles", model: "vehicle", entity: "vehicle", read: "org.read", write: "org.write",
  createSchema: orgVehicleSchema, searchFields: ["number", "driverName", "type"], filterFields: ["isActive"],
  orderBy: { number: "asc" },
});

@Module({
  controllers: [OrgController, GodownController, RackController, VehicleController],
  providers: [],
})
export class OrgModule {}
