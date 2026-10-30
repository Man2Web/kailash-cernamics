import { z } from "zod";

export const loginSchema = z.object({
  /** Email address or mobile number (the field keeps the name "email" for existing clients). */
  email: z.string().trim().toLowerCase().min(3, "Enter your email or mobile number").max(120),
  password: z.string().min(1, "Password is required"),
  totp: z.string().trim().regex(/^\d{6}$/).optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "At least 8 characters"),
});

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: { id: string; code: string; name: string; discountLimitPct: number };
  permissions: string[];
  branches: { id: string; code: string; name: string; stateCode: string }[];
  defaultBranchId: string | null;
  totpEnabled: boolean;
}
