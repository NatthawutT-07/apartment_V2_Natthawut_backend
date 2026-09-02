import { z } from "zod";

const optionalSecret = z.string().trim().min(8).max(5000).optional();

export const lineSettingsSchema = z.object({
  oaBasicId: z.string().trim().min(2).max(100),
  messagingChannelId: z.string().trim().min(2).max(100),
  messagingChannelSecret: optionalSecret,
  messagingAccessToken: optionalSecret,
  loginChannelId: z.string().trim().min(2).max(100),
  loginChannelSecret: optionalSecret,
  apiBaseUrl: z.url().max(500),
  frontendBaseUrl: z.url().max(500),
  isActive: z.boolean(),
}).strict();

export const lineTenantParamsSchema = z.object({ tenantId: z.uuid() }).strict();
export const lineBillParamsSchema = z.object({ billId: z.uuid() }).strict();
export const lineConnectSchema = z.object({ inviteToken: z.string().min(32).max(500) }).strict();
export const lineCallbackSchema = z.object({ code: z.string().min(1), state: z.string().min(32), error: z.string().optional() }).passthrough();

export type LineSettingsInput = z.infer<typeof lineSettingsSchema>;
