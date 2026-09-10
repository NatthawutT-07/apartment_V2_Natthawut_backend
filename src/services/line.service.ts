import crypto from "node:crypto";
import {
  BillStatus,
  LineNotificationStatus,
  LineNotificationType,
  Prisma,
} from "../generated/prisma/client.js";
import { AppError } from "../errors/app-error.js";
import { getLineEnvironmentConfig } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import type { LineSettingsInput } from "../validation/line.validation.js";
import { decryptSecret, encryptSecret } from "./secret.service.js";

const CENTRAL_CONFIG_ID = "central";
const INVITE_LIFETIME_MS = 24 * 60 * 60 * 1_000;

const cleanBaseUrl = (value: string) => value.replace(/\/+$/, "");
const randomToken = () => crypto.randomBytes(32).toString("base64url");
const tokenHash = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

export async function getPublicLineSettings() {
  const environment = getLineEnvironmentConfig();
  if (environment) {
    return {
      configured: environment.configured,
      managedByEnvironment: true,
      missingEnvironmentVariables: environment.missingEnvironmentVariables,
      oaBasicId: environment.oaBasicId,
      messagingChannelId: environment.messagingChannelId,
      loginChannelId: environment.loginChannelId,
      apiBaseUrl: environment.apiBaseUrl,
      frontendBaseUrl: environment.frontendBaseUrl,
      isActive: environment.isActive,
      hasMessagingChannelSecret: Boolean(environment.messagingChannelSecret),
      hasMessagingAccessToken: Boolean(environment.messagingAccessToken),
      hasLoginChannelSecret: Boolean(environment.loginChannelSecret),
    };
  }
  const config = await prisma.lineOaConfig.findUnique({ where: { id: CENTRAL_CONFIG_ID } });
  if (!config) return { configured: false, isActive: false };
  return {
    configured: true,
    oaBasicId: config.oaBasicId,
    messagingChannelId: config.messagingChannelId,
    loginChannelId: config.loginChannelId,
    apiBaseUrl: config.apiBaseUrl,
    frontendBaseUrl: config.frontendBaseUrl,
    isActive: config.isActive,
    hasMessagingChannelSecret: Boolean(config.messagingChannelSecretEncrypted),
    hasMessagingAccessToken: Boolean(config.messagingAccessTokenEncrypted),
    hasLoginChannelSecret: Boolean(config.loginChannelSecretEncrypted),
    updatedAt: config.updatedAt,
  };
}

export async function saveLineSettings(input: LineSettingsInput) {
  if (getLineEnvironmentConfig()) {
    throw new AppError(409, "LINE OA settings are managed by backend environment variables");
  }
  const existing = await prisma.lineOaConfig.findUnique({ where: { id: CENTRAL_CONFIG_ID } });
  if (!existing && (!input.messagingChannelSecret || !input.messagingAccessToken || !input.loginChannelSecret)) {
    throw new AppError(400, "All LINE secrets are required for the first setup");
  }
  await prisma.lineOaConfig.upsert({
    where: { id: CENTRAL_CONFIG_ID },
    create: {
      id: CENTRAL_CONFIG_ID,
      oaBasicId: input.oaBasicId,
      messagingChannelId: input.messagingChannelId,
      messagingChannelSecretEncrypted: encryptSecret(input.messagingChannelSecret!),
      messagingAccessTokenEncrypted: encryptSecret(input.messagingAccessToken!),
      loginChannelId: input.loginChannelId,
      loginChannelSecretEncrypted: encryptSecret(input.loginChannelSecret!),
      apiBaseUrl: cleanBaseUrl(input.apiBaseUrl),
      frontendBaseUrl: cleanBaseUrl(input.frontendBaseUrl),
      isActive: input.isActive,
    },
    update: {
      oaBasicId: input.oaBasicId,
      messagingChannelId: input.messagingChannelId,
      messagingChannelSecretEncrypted: input.messagingChannelSecret ? encryptSecret(input.messagingChannelSecret) : undefined,
      messagingAccessTokenEncrypted: input.messagingAccessToken ? encryptSecret(input.messagingAccessToken) : undefined,
      loginChannelId: input.loginChannelId,
      loginChannelSecretEncrypted: input.loginChannelSecret ? encryptSecret(input.loginChannelSecret) : undefined,
      apiBaseUrl: cleanBaseUrl(input.apiBaseUrl),
      frontendBaseUrl: cleanBaseUrl(input.frontendBaseUrl),
      isActive: input.isActive,
    },
  });
  return getPublicLineSettings();
}

async function activeConfig() {
  const environment = getLineEnvironmentConfig();
  if (environment) {
    if (!environment.configured) {
      throw new AppError(503, `LINE OA environment configuration is incomplete: ${environment.missingEnvironmentVariables.join(", ")}`);
    }
    if (!environment.isActive) throw new AppError(503, "LINE OA is inactive");
    return environment;
  }
  const config = await prisma.lineOaConfig.findUnique({ where: { id: CENTRAL_CONFIG_ID } });
  if (!config?.isActive) throw new AppError(503, "LINE OA is not configured or inactive");
  return {
    ...config,
    managedByEnvironment: false as const,
    messagingChannelSecret: decryptSecret(config.messagingChannelSecretEncrypted),
    messagingAccessToken: decryptSecret(config.messagingAccessTokenEncrypted),
    loginChannelSecret: decryptSecret(config.loginChannelSecretEncrypted),
  };
}

export async function testLineConnection() {
  const config = await activeConfig();
  const response = await fetch("https://api.line.me/v2/bot/info", {
    headers: { Authorization: `Bearer ${config.messagingAccessToken}` },
  });
  if (!response.ok) throw new AppError(502, "LINE rejected the Messaging API access token");
  const bot = await response.json() as { displayName?: string; basicId?: string; premiumId?: string };
  return { connected: true, displayName: bot.displayName ?? null, basicId: bot.basicId ?? bot.premiumId ?? null };
}

export async function createTenantLineInvite(apartmentId: string, adminUserId: string, tenantId: string) {
  const [tenant, config] = await Promise.all([
    prisma.tenantUser.findFirst({ where: { id: tenantId, apartmentId, isActive: true }, select: { id: true, fullName: true, roomNumber: true } }),
    activeConfig(),
  ]);
  if (!tenant) throw new AppError(404, "Tenant not found");
  const token = randomToken();
  const expiresAt = new Date(Date.now() + INVITE_LIFETIME_MS);
  const invalidatedAt = new Date();
  await prisma.$transaction([
    prisma.lineLinkInvite.updateMany({
      where: { tenantId, usedAt: null },
      data: { usedAt: invalidatedAt },
    }),
    prisma.lineLinkInvite.create({
      data: { tenantId, createdByAdminId: adminUserId, tokenHash: tokenHash(token), expiresAt },
    }),
  ]);
  return {
    tenant,
    expiresAt,
    connectUrl: `${cleanBaseUrl(config.frontendBaseUrl)}/tenant/line-connect?invite=${encodeURIComponent(token)}`,
  };
}

export async function disconnectTenantLine(apartmentId: string, tenantId: string) {
  const tenant = await prisma.tenantUser.findFirst({ where: { id: tenantId, apartmentId }, select: { id: true } });
  if (!tenant) throw new AppError(404, "Tenant not found");
  await prisma.$transaction([
    prisma.tenantLineAccount.updateMany({ where: { tenantId, isActive: true }, data: { isActive: false, unlinkedAt: new Date() } }),
    prisma.lineLinkInvite.updateMany({ where: { tenantId, usedAt: null }, data: { usedAt: new Date() } }),
  ]);
}

export async function getTenantLineStatus(tenantId: string, apartmentId: string) {
  const account = await prisma.tenantLineAccount.findFirst({
    where: { tenantId, apartmentId },
    select: { displayName: true, isActive: true, linkedAt: true, unlinkedAt: true, blockedAt: true },
  });
  return { connected: Boolean(account?.isActive && !account.blockedAt), account };
}

export async function startTenantLineConnect(tenantId: string, apartmentId: string, inviteToken: string) {
  const config = await activeConfig();
  const invite = await prisma.lineLinkInvite.findFirst({
    where: { tokenHash: tokenHash(inviteToken), tenantId, usedAt: null, expiresAt: { gt: new Date() }, tenant: { apartmentId, isActive: true } },
    select: { id: true },
  });
  if (!invite) throw new AppError(400, "LINE connection invitation is invalid or expired");
  const state = randomToken();
  await prisma.lineLinkInvite.update({ where: { id: invite.id }, data: { oauthStateHash: tokenHash(state), startedAt: new Date() } });
  const callbackUrl = `${cleanBaseUrl(config.apiBaseUrl)}/api/line/callback`;
  const query = new URLSearchParams({
    response_type: "code",
    client_id: config.loginChannelId,
    redirect_uri: callbackUrl,
    state,
    scope: "openid profile",
    bot_prompt: "aggressive",
  });
  return { authorizationUrl: `https://access.line.me/oauth2/v2.1/authorize?${query.toString()}` };
}

export async function completeLineConnect(code: string, state: string) {
  const config = await activeConfig();
  const invite = await prisma.lineLinkInvite.findFirst({
    where: { oauthStateHash: tokenHash(state), usedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, tenantId: true, tenant: { select: { apartmentId: true, roomNumber: true, apartment: { select: { name: true } } } } },
  });
  if (!invite) throw new AppError(400, "LINE OAuth state is invalid or expired");
  const callbackUrl = `${cleanBaseUrl(config.apiBaseUrl)}/api/line/callback`;
  const tokenResponse = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: callbackUrl, client_id: config.loginChannelId, client_secret: config.loginChannelSecret }),
  });
  if (!tokenResponse.ok) throw new AppError(502, "LINE Login token exchange failed");
  const tokens = await tokenResponse.json() as { access_token: string };
  const profileResponse = await fetch("https://api.line.me/v2/profile", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  if (!profileResponse.ok) throw new AppError(502, "Unable to read LINE profile");
  const profile = await profileResponse.json() as { userId: string; displayName?: string; pictureUrl?: string };
  try {
    await prisma.$transaction([
      prisma.tenantLineAccount.upsert({
        where: { tenantId: invite.tenantId },
        create: { tenantId: invite.tenantId, apartmentId: invite.tenant.apartmentId, lineUserId: profile.userId, displayName: profile.displayName, pictureUrl: profile.pictureUrl },
        update: { lineUserId: profile.userId, displayName: profile.displayName, pictureUrl: profile.pictureUrl, isActive: true, linkedAt: new Date(), unlinkedAt: null, blockedAt: null },
      }),
      prisma.lineLinkInvite.updateMany({
        where: { tenantId: invite.tenantId, usedAt: null },
        data: { usedAt: new Date() },
      }),
    ]);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new AppError(409, "This LINE account is already linked to another tenant");
    throw error;
  }
  await sendLinePush(profile.userId, config.messagingAccessToken, [{
    type: "text",
    text: `เชื่อมต่อ LINE OA สำเร็จ\n${invite.tenant.apartment.name}\nห้อง ${invite.tenant.roomNumber}\nจากนี้คุณจะได้รับการแจ้งเตือนบิลผ่านแชตนี้`,
  }]).catch(() => undefined);
  return { frontendBaseUrl: cleanBaseUrl(config.frontendBaseUrl) };
}

async function sendLinePush(lineUserId: string, accessToken: string, messages: unknown[]) {
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ to: lineUserId, messages }),
  });
  if (!response.ok) throw new Error(`LINE push failed with status ${response.status}`);
}

export async function handleLineWebhook(rawBody: Buffer, signature: string | undefined) {
  const config = await activeConfig();
  if (!signature) throw new AppError(401, "Missing LINE signature");
  const expected = crypto.createHmac("sha256", config.messagingChannelSecret).update(rawBody).digest("base64");
  const received = Buffer.from(signature);
  const valid = received.length === Buffer.byteLength(expected) && crypto.timingSafeEqual(received, Buffer.from(expected));
  if (!valid) throw new AppError(401, "Invalid LINE signature");
  const body = JSON.parse(rawBody.toString("utf8")) as { events?: Array<{ type: string; source?: { userId?: string } }> };
  for (const event of body.events ?? []) {
    const lineUserId = event.source?.userId;
    if (!lineUserId) continue;
    if (event.type === "unfollow") await prisma.tenantLineAccount.updateMany({ where: { lineUserId }, data: { isActive: false, blockedAt: new Date() } });
    if (event.type === "follow") await prisma.tenantLineAccount.updateMany({ where: { lineUserId }, data: { isActive: true, blockedAt: null, unlinkedAt: null } });
  }
}

export async function queueBillLineNotification(transaction: Prisma.TransactionClient, billId: string, tenantId: string, eventType: LineNotificationType) {
  return transaction.lineNotification.upsert({
    where: { billId_eventType: { billId, eventType } },
    create: { billId, tenantId, eventType },
    update: { tenantId, status: LineNotificationStatus.PENDING, lastError: null },
  });
}

export async function sendBillLineNotification(billId: string, eventType: LineNotificationType) {
  const notification = await prisma.lineNotification.findUnique({
    where: { billId_eventType: { billId, eventType } },
    select: {
      id: true,
      attemptCount: true,
      bill: { select: { id: true, apartmentId: true, tenantId: true, tenantName: true, roomNumber: true, billingPeriod: true, totalAmount: true, dueDate: true, status: true, apartment: { select: { name: true } }, items: { orderBy: { sortOrder: "asc" }, select: { name: true, quantity: true, unitPrice: true, amount: true } }, tenant: { select: { lineAccount: { select: { lineUserId: true, isActive: true, blockedAt: true } } } } } },
    },
  });
  if (!notification) return;
  try {
    const config = await activeConfig();
    const account = notification.bill.tenant?.lineAccount;
    if (!account?.isActive || account.blockedAt) throw new Error("Tenant has no active LINE connection");
    const amount = Number(notification.bill.totalAmount).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const isPaid = eventType === LineNotificationType.BILL_PAID;
    const itemLines = notification.bill.items.slice(0, 8).map((item) => ({
      type: "box",
      layout: "horizontal",
      contents: [
        { type: "text", text: `${item.name}${Number(item.quantity) !== 1 ? ` × ${Number(item.quantity)}` : ""}`, size: "sm", color: "#4D5B55", flex: 3, wrap: true },
        { type: "text", text: `฿${Number(item.amount).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, size: "sm", color: "#14231D", align: "end", flex: 2 },
      ],
    }));
    const message = {
      to: account.lineUserId,
      messages: [{
        type: "flex",
        altText: isPaid ? `ยืนยันรับชำระเงินห้อง ${notification.bill.roomNumber}` : `บิลใหม่ห้อง ${notification.bill.roomNumber} ฿${amount}`,
        contents: {
          type: "bubble",
          header: { type: "box", layout: "vertical", backgroundColor: isPaid ? "#1F7A5B" : "#174C3C", contents: [{ type: "text", text: isPaid ? "ชำระเงินเรียบร้อย" : "แจ้งบิลประจำเดือน", color: "#FFFFFF", weight: "bold", size: "lg" }] },
          body: { type: "box", layout: "vertical", spacing: "md", contents: [
            { type: "text", text: notification.bill.apartment.name, weight: "bold", size: "md", color: "#14231D", wrap: true },
            { type: "text", text: `ห้อง ${notification.bill.roomNumber} · ${notification.bill.tenantName}`, size: "sm", color: "#6B756F", wrap: true },
            ...itemLines,
            ...(notification.bill.items.length > 8 ? [{ type: "text", text: `และอีก ${notification.bill.items.length - 8} รายการ`, size: "xs", color: "#6B756F" }] : []),
            { type: "separator" },
            { type: "text", text: `฿${amount}`, size: "xxl", weight: "bold", color: "#14231D" },
            { type: "text", text: isPaid ? "ระบบบันทึกการชำระเงินแล้ว" : "กรุณาตรวจสอบรายละเอียดและวันครบกำหนด", size: "sm", wrap: true, color: "#6B756F" },
          ] },
          footer: { type: "box", layout: "vertical", contents: [{ type: "button", style: "primary", color: "#236D58", action: { type: "uri", label: isPaid ? "ดูประวัติการชำระ" : "ดูบิลและชำระเงิน", uri: `${cleanBaseUrl(config.frontendBaseUrl)}${isPaid ? "/tenant/payments" : "/tenant/dashboard"}` } }] },
        },
      }],
    };
    await sendLinePush(account.lineUserId, config.messagingAccessToken, message.messages);
    await prisma.lineNotification.update({ where: { id: notification.id }, data: { status: LineNotificationStatus.SENT, sentAt: new Date(), attemptCount: { increment: 1 }, lastError: null } });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : "Unknown LINE delivery error";
    await prisma.lineNotification.update({ where: { id: notification.id }, data: { status: LineNotificationStatus.FAILED, attemptCount: { increment: 1 }, lastError: message } });
  }
}

export async function retryBillLineNotification(apartmentId: string, billId: string) {
  const bill = await prisma.bill.findFirst({ where: { id: billId, apartmentId }, select: { id: true, tenantId: true, status: true } });
  if (!bill?.tenantId) throw new AppError(404, "Bill or active tenant not found");
  if (bill.status === BillStatus.VOID) throw new AppError(409, "A cancelled bill cannot be sent");
  const eventType = bill.status === BillStatus.PAID ? LineNotificationType.BILL_PAID : LineNotificationType.BILL_CREATED;
  await prisma.lineNotification.upsert({ where: { billId_eventType: { billId, eventType } }, create: { billId, tenantId: bill.tenantId, eventType }, update: { status: LineNotificationStatus.PENDING, lastError: null } });
  await sendBillLineNotification(billId, eventType);
}
