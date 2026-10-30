import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
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
