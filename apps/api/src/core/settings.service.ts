import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ALL_FEATURE_KEYS, type AnyFeatureKey, featureOn, type FeatureFlags } from "@gc/shared";
import { stampCreate, stampUpdate } from "../common/context";

/** Defaults for settings editable in Settings > General. */
export const SETTING_DEFAULTS: Record<string, unknown> = {
  "wastage.floor": 5,
  "wastage.wall": 8,
  "wastage.skirting": 8,
  "wastage.highlighter": 8,
  "quotation.validityDays": 15,
  "grn.allocationBasis": "VALUE",
  "charges.gstRate": 18,
  "stock.deadStockDays": 180,
  "tally.heartbeatAlertMinutes": 15,
};

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get<T = unknown>(key: string): Promise<T> {
    const row = await this.prisma.setting.findUnique({ where: { key } });
    return (row ? row.value : SETTING_DEFAULTS[key]) as T;
  }

  private flags: { at: number; value: FeatureFlags } | null = null;

  /** The saved switches for modules and their parts. Everything is on until the Super Admin turns something off. Cached briefly. */
  async features(): Promise<FeatureFlags> {
    if (this.flags && Date.now() - this.flags.at < 5_000) return this.flags.value;
    const rows = await this.prisma.setting.findMany({ where: { key: { startsWith: "feature." }, deletedAt: null } });
    const value = Object.fromEntries(ALL_FEATURE_KEYS.map((k) => [k, rows.find((r) => r.key === `feature.${k}`)?.value !== false])) as FeatureFlags;
    this.flags = { at: Date.now(), value };
    return value;
  }

  /** Is it really on: its own switch and, for a part, its module's switch too. */
  async isFeatureOn(key: AnyFeatureKey): Promise<boolean> {
    return featureOn(await this.features(), key);
  }

  async setFeatures(changes: Partial<FeatureFlags>) {
    for (const [k, v] of Object.entries(changes)) if (typeof v === "boolean") await this.set(`feature.${k}`, v);
    this.flags = null;
  }

  async all(): Promise<Record<string, unknown>> {
    const rows = await this.prisma.setting.findMany({ where: { deletedAt: null } });
    const out: Record<string, unknown> = { ...SETTING_DEFAULTS };
    for (const r of rows) out[r.key] = r.value;
    return out;
  }

  async set(key: string, value: unknown) {
    return this.prisma.setting.upsert({
      where: { key },
      create: { key, value: value as never, ...stampCreate() },
      update: { value: value as never, ...stampUpdate() },
    });
  }
}
