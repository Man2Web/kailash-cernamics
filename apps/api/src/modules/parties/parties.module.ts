import { Module } from "@nestjs/common";
import { partiesInfluencerSchema } from "@gc/shared";
import { crudController } from "../../common/crud.factory";
import { PartiesController } from "./parties.controller";

const InfluencerController = crudController({
  path: "influencers", model: "influencer", entity: "influencer", read: "party.read", write: "party.write",
  createSchema: partiesInfluencerSchema, searchFields: ["name", "phone", "firm"], filterFields: ["type", "isActive"],
});

@Module({
  controllers: [PartiesController, InfluencerController],
  providers: [],
})
export class PartiesModule {}
