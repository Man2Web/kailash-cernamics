import { BadRequestException, PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";

/** Validate a body/query with a shared Zod schema. Errors come back as { message, issues[] }. */
export class ZodPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value ?? {});
    if (!result.success) {
      const issues = result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
      throw new BadRequestException({ message: issues[0]?.message ?? "Invalid input", issues });
    }
    return result.data;
  }
}
