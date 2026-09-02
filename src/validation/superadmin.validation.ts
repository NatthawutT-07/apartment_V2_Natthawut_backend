import { z } from "zod";

const bcryptPassword = z
  .string()
  .min(8, "Temporary password must contain at least 8 characters")
  .refine((value) => Buffer.byteLength(value, "utf8") <= 72, {
    message: "Temporary password must not exceed 72 bytes",
  });

const optionalPhone = z
  .string()
  .trim()
  .max(30)
  .optional()
  .transform((value) => value || undefined);

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  }, "Date is invalid");

export const createApartmentAdminSchema = z
  .object({
    apartmentName: z.string().trim().min(2).max(200),
    apartmentCode: z
      .string()
      .trim()
      .toLowerCase()
      .min(2)
      .max(100)
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "Apartment code may contain lowercase letters, numbers, and hyphens",
      ),
    totalRooms: z.coerce.number().int().min(1).max(5_000),
    adminFullName: z.string().trim().min(2).max(200),
    adminUsername: z.string().trim().min(3).max(100),
    adminPhone: optionalPhone,
    temporaryPassword: bcryptPassword,
    accessStartDate: dateOnly,
    accessEndDate: dateOnly,
  })
  .strict()
  .refine((value) => value.accessEndDate >= value.accessStartDate, {
    message: "Access end date must be on or after the start date",
    path: ["accessEndDate"],
  });

export const adminIdParamsSchema = z.object({ adminId: z.uuid() }).strict();

export const adminAccessParamsSchema = z
  .object({
    apartmentId: z.uuid(),
    adminId: z.uuid(),
  })
  .strict();

export const updateAdminStatusSchema = z
  .object({ isActive: z.boolean() })
  .strict();

export const adjustAdminAccessSchema = z
  .object({
    days: z.coerce.number().int().min(-3_650).max(3_650),
  })
  .strict()
  .refine((value) => value.days !== 0, {
    message: "Days must be greater or less than zero",
    path: ["days"],
  });

export type CreateApartmentAdminInput = z.infer<typeof createApartmentAdminSchema>;
