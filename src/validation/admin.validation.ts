import { z } from "zod";

const billingItemKind = z.enum(["RENT", "WATER", "ELECTRICITY", "OTHER"]);
const billingCalculation = z.enum(["FIXED", "USAGE"]);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalDate = z.union([dateOnly, z.literal("")]).optional()
  .transform((value) => value || undefined);
const password = z.string().min(8).refine(
  (value) => Buffer.byteLength(value, "utf8") <= 72,
  "Password must not exceed 72 bytes",
);

export const billingItemSchema = z.object({
  name: z.string().trim().min(1).max(100),
  kind: billingItemKind,
  calculationType: billingCalculation,
  unitPrice: z.coerce.number().min(0).max(10_000_000),
  sortOrder: z.coerce.number().int().min(0).max(10_000).optional(),
}).strict();

export const billingItemParamsSchema = z.object({ itemId: z.uuid() }).strict();
export const tenantParamsSchema = z.object({ tenantId: z.uuid() }).strict();
export const updateTenantLeaseSchema = z.object({ moveOutDate: z.union([dateOnly, z.literal("")]) }).strict();
export const billParamsSchema = z.object({ billId: z.uuid() }).strict();
export const contactParamsSchema = z.object({ contactId: z.uuid() }).strict();

export const contactSchema = z.object({
  label: z.string().trim().min(1).max(100),
  contactName: z.string().trim().max(150).optional().transform((value) => value || undefined),
  channel: z.enum(["PHONE", "LINE"]),
  value: z.string().trim().min(2).max(150),
  note: z.string().trim().max(500).optional().transform((value) => value || undefined),
  sortOrder: z.coerce.number().int().min(0).max(10_000).optional(),
}).strict();

export const bankAccountSchema = z.object({
  bankCode: z.string().trim().min(2).max(30),
  bankName: z.string().trim().min(2).max(100),
  accountType: z.enum(["SAVINGS", "CURRENT", "PROMPTPAY"]),
  accountName: z.string().trim().min(2).max(200),
  accountNumber: z.string().trim().min(6).max(50).regex(/^[0-9 -]+$/),
  isPrimary: z.boolean().default(false),
}).strict();
export const bankAccountParamsSchema = z.object({ accountId: z.uuid() }).strict();

const billLineSchema = z.object({
  name: z.string().trim().min(1).max(100),
  kind: billingItemKind,
  calculationType: billingCalculation,
  quantity: z.coerce.number().min(0).max(1_000_000),
  unitPrice: z.coerce.number().min(0).max(10_000_000),
}).strict();

const billInputSchema = z.object({
  billingMonth: z.string().regex(/^\d{4}-\d{2}$/),
  dueDate: optionalDate,
  status: z.enum(["SENT", "PAID"]).default("SENT"),
  items: z.array(billLineSchema).min(1).max(100),
}).strict();

export const createTenantSchema = z.object({
  roomId: z.uuid(),
  roomNumber: z.string().trim().min(1).max(20),
  floor: z.string().trim().min(1).max(20),
  fullName: z.string().trim().min(2).max(200),
  idCard: z.string().trim().min(6).max(30),
  phone: z.string().trim().min(6).max(30),
  username: z.string().trim().min(3).max(100),
  password,
  moveInDate: dateOnly,
  moveOutDate: optionalDate,
  initialBill: billInputSchema.optional(),
}).strict().refine(
  (value) => !value.moveOutDate || value.moveOutDate >= value.moveInDate,
  { message: "Move-out date must be on or after move-in date", path: ["moveOutDate"] },
);

export const createBillSchema = billInputSchema.extend({
  tenantId: z.uuid(),
}).strict();
export const updateBillSchema = billInputSchema.omit({ status: true }).strict();

export type BillingItemInput = z.infer<typeof billingItemSchema>;
export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type CreateBillInput = z.infer<typeof createBillSchema>;
export type UpdateBillInput = z.infer<typeof updateBillSchema>;
export type ContactInput = z.infer<typeof contactSchema>;
export type BankAccountInput = z.infer<typeof bankAccountSchema>;
export type UpdateTenantLeaseInput = z.infer<typeof updateTenantLeaseSchema>;
