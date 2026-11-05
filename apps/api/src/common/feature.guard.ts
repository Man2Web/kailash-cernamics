import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { featureForRoute, featureLabel, featureOn, moduleOf } from "@gc/shared";
import { SettingsService } from "../core/settings.service";

/**
 * One place that enforces the Super Admin's switches. A route belongs to a module, or to one part of a module such as
 * Invoices (see featureForRoute); when that is off, or its module is off, the request is refused, whoever is asking. Routes not listed there
 * (sign-in, users, settings, the catalogue, customers and suppliers...) are always available, so the Super Admin can
 * always get back to the switches.
 */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(private readonly settings: SettingsService) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const feature = featureForRoute(req.path);
    if (!feature) return true;
    const flags = await this.settings.features();
    if (featureOn(flags, feature)) return true;
    // Name the module when the whole module is off, otherwise the part that is off.
    const module = moduleOf(feature);
    const culprit = module && flags[module] === false ? module : feature;
    throw new ForbiddenException(`${featureLabel(culprit)} is turned off by the Super Admin.`);
  }
}
