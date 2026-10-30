// Zod schemas for the org and users modules (company, branches, godowns, racks, number series,
// vehicles, users, roles).
import { z } from "zod";
import { validateGstin } from "../gstin";
import { optionalText, requiredText, stateCodeSchema } from "./common";

const optionalGstin = z
  .string()
  .trim()
  .toUpperCase()
  .optional()
  .nullable()
  .or(z.literal(""))
  .superRefine((v, ctx) => {
    if (!v) return;
    const r = validateGstin(v);
    if (!r.valid) ctx.addIssue({ code: "custom", message: r.error ?? "Invalid GSTIN" });
  });

export const orgCompanySchema = z.object({
  name: requiredText("Name"),
  legalName: optionalText,
  gstin: optionalGstin,
  pan: z.string().trim().max(10).optional().nullable(),
  address: optionalText,
  phone: z.string().trim().max(30).optional().nullable(),
  email: z.string().trim().email().optional().nullable().or(z.literal("")),
  logoUrl: z.string().optional().nullable(),
});

export const orgBranchSchema = z.object({
  code: z.string().trim().toUpperCase().min(2, "Code is required").max(10).regex(/^[A-Z0-9]+$/, "Letters and digits only"),
  name: requiredText("Name"),
  address: optionalText,
  city: z.string().trim().max(80).optional().nullable(),
  state: z.string().trim().max(80).optional().nullable(),
  stateCode: stateCodeSchema,
  gstin: optionalGstin,
  phone: z.string().trim().max(30).optional().nullable(),
  tallyCompanyName: z.string().trim().max(120).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const orgGodownSchema = z.object({
  branchId: z.string().min(1, "Branch is required"),
  code: z.string().trim().toUpperCase().min(1, "Code is required").max(20),
  name: requiredText("Name"),
  isDisplay: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const orgRackSchema = z.object({
  godownId: z.string().min(1, "Godown is required"),
  code: z.string().trim().toUpperCase().min(1, "Code is required").max(20),
  name: z.string().trim().max(80).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const orgNumberSeriesSchema = z.object({
  prefix: z.string().trim().min(1).max(10),
  nextNo: z.coerce.number().int().min(1),
  padding: z.coerce.number().int().min(1).max(8).default(4),
});

export const orgVehicleSchema = z.object({
  number: z.string().trim().toUpperCase().min(4, "Vehicle number is required").max(20),
  type: z.string().trim().max(40).optional().nullable(),
  driverName: z.string().trim().max(80).optional().nullable(),
  driverPhone: z.string().trim().max(20).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const usersCreateSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  name: requiredText("Name"),
  phone: z.string().trim().max(20).optional().nullable(),
  roleId: z.string().min(1, "Role is required"),
  branchIds: z.array(z.string()).default([]),
  defaultBranchId: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
  password: z.string().min(8, "At least 8 characters"),
});

// Fields with create-time defaults are redefined without them: a partial update must change only what it sends.
// (With the defaults, renaming a user would re-activate them and wipe their branch access.)
export const usersUpdateSchema = usersCreateSchema
  .omit({ password: true })
  .extend({ branchIds: z.array(z.string()).optional(), isActive: z.boolean().optional() })
  .partial();

export const usersResetPasswordSchema = z.object({ password: z.string().min(8, "At least 8 characters") });

export const usersRoleSchema = z.object({
  code: z.string().trim().toUpperCase().min(2).max(30).regex(/^[A-Z0-9_]+$/, "Letters, digits and _ only"),
  name: requiredText("Name"),
  discountLimitPct: z.coerce.number().min(0).max(100).default(0),
});

export const usersRolePermissionsSchema = z.object({ codes: z.array(z.string()) });
