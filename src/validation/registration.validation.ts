import { z } from "zod";

const requiredText = (max: number) => z.string().trim().min(1).max(max);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const registrationSchema = z.object({
  plan: z.enum(["FREE_30_DAYS", "TRIAL_3_MONTHS", "FULL_1_YEAR"]),
  firstNameTh: requiredText(100), lastNameTh: requiredText(100),
  firstNameEn: requiredText(100), lastNameEn: requiredText(100),
  birthDate: dateOnly,
  phone: requiredText(30),
  email: z.email().max(200).transform((value) => value.toLowerCase()),
  ownerFullNameTh: requiredText(200), ownerFullNameEn: requiredText(200),
  apartmentNameTh: requiredText(200), apartmentNameEn: requiredText(200),
  totalRooms: z.coerce.number().int().min(1).max(5_000),
  houseNumber: requiredText(50),
  moo: z.string().trim().max(50).optional().transform((value) => value || undefined),
  subdistrict: requiredText(100), district: requiredText(100), province: requiredText(100),
  postalCode: z.string().trim().regex(/^\d{5}$/),
}).strict();

export const registrationParamsSchema = z.object({ registrationId: z.uuid() }).strict();
export const approveRegistrationSchema = z.object({
  adminUsername: z.string().trim().min(3).max(100),
  temporaryPassword: z.string().min(8).refine((value) => Buffer.byteLength(value, "utf8") <= 72),
  apartmentCode: z.string().trim().toLowerCase().min(2).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
}).strict();

export type RegistrationInput = z.infer<typeof registrationSchema>;
export type ApproveRegistrationInput = z.infer<typeof approveRegistrationSchema>;

export const customPlanInquirySchema = z.object({
  fullName: requiredText(200),
  phone: requiredText(30),
  email: z.email().max(200).transform((value) => value.toLowerCase()),
  lineId: z.string().trim().max(100).optional().transform((value) => value || undefined),
  message: requiredText(3000),
}).strict();
export const inquiryParamsSchema = z.object({ inquiryId: z.uuid() }).strict();
export const updateInquiryStatusSchema = z.object({ status: z.enum(["NEW", "CONTACTED", "CLOSED"]) }).strict();
export type CustomPlanInquiryInput = z.infer<typeof customPlanInquirySchema>;
