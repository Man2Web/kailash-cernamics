import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { FEATURES, ROUTE_FEATURE } from "@gc/shared";
import { SettingsService } from "../core/settings.service";

/**
 * One place that enforces the Super Admin's module switches. A route belongs to a module by its first path segment
 * (see ROUTE_FEATURE); when that module is off the request is refused, whoever is asking. Routes not listed there
 * (sign-in, users, settings, the catalogue, customers and suppliers...) are always available, so the Super Admin can
 * always get back to the switches.
 */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(private readonly settings: SettingsService) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const segment = req.path.replace(/^\/api\//, "").split("/")[0];
    const feature = ROUTE_FEATURE[segment];
    if (!feature) return true;
    if (await this.settings.isFeatureOn(feature)) return true;
    const label = FEATURES.find((f) => f.key === feature)?.label ?? feature;
    throw new ForbiddenException(`${label} is turned off by the Super Admin.`);
  }
}
