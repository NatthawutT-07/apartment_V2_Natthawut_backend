import { z } from "zod";

const bcryptPassword = z
  .string()
  .min(1)
  .refine((value) => Buffer.byteLength(value, "utf8") <= 72, {
    message: "Password must not exceed 72 bytes",
  });

export const adminLoginSchema = z
  .object({
    username: z.string().trim().min(1).max(100),
    password: bcryptPassword,
  })
  .strict();

export const tenantLoginSchema = z
  .object({
    apartmentCode: z.string().trim().toLowerCase().min(1).max(100),
    username: z.string().trim().min(1).max(100),
    password: bcryptPassword,
  })
  .strict();

export const switchApartmentSchema = z
  .object({
    apartmentId: z.uuid(),
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: bcryptPassword,
    newPassword: bcryptPassword.min(8),
  })
  .strict()
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: "New password must be different from the current password",
    path: ["newPassword"],
  });
