import { z } from "zod";

/** Query string for every list endpoint: server-side paging, search and sort. */
export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(10000).default(25),
  q: z.string().trim().optional(),
  sort: z.string().optional(),
  dir: z.enum(["asc", "desc"]).default("asc"),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const idSchema = z.string().min(1);

/** Integer paise. Accepts numbers or numeric strings. */
export const paiseSchema = z.coerce.number().int();
export const nonNegPaiseSchema = z.coerce.number().int().min(0);
export const pctSchema = z.coerce.number().min(0).max(100);
export const optionalText = z.string().trim().max(2000).optional().nullable();
export const requiredText = (label: string, max = 200) => z.string().trim().min(1, `${label} is required`).max(max);
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^[0-9+\-\s]{6,20}$/, "Enter a valid phone number")
  .optional()
  .nullable()
  .or(z.literal(""));
export const stateCodeSchema = z.string().regex(/^[0-9]{2}$/, "Two-digit state code");
export const dateSchema = z.coerce.date();
