import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  tenantUser: { findFirst: vi.fn() },
  lineLinkInvite: {
    findFirst: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
  },
  tenantLineAccount: { upsert: vi.fn(), updateMany: vi.fn() },
  lineNotification: { findUnique: vi.fn(), update: vi.fn() },
}));

vi.mock("../src/lib/prisma.js", () => ({ prisma: prismaMock }));

import { completeLineConnect, createTenantLineInvite, disconnectTenantLine, sendBillLineNotification } from "../src/services/line.service.js";

const tenantId = "50000000-0000-4000-8000-000000000000";
const apartmentId = "20000000-0000-4000-8000-000000000000";
const adminId = "10000000-0000-4000-8000-000000000000";

describe("LINE tenant linking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(process.env, {
      LINE_CONFIG_SOURCE: "env",
      LINE_OA_ACTIVE: "true",
      LINE_OA_BASIC_ID: "@apartment",
      LINE_MESSAGING_CHANNEL_ID: "messaging-channel",
      LINE_MESSAGING_CHANNEL_SECRET: "messaging-secret",
      LINE_MESSAGING_ACCESS_TOKEN: "messaging-token",
      LINE_LOGIN_CHANNEL_ID: "login-channel",
      LINE_LOGIN_CHANNEL_SECRET: "login-secret",
      LINE_PUBLIC_API_BASE_URL: "https://api.example.com",
      LINE_FRONTEND_BASE_URL: "https://app.example.com",
    });
    prismaMock.lineLinkInvite.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.lineLinkInvite.create.mockResolvedValue({ id: "invite-id" });
    prismaMock.tenantLineAccount.upsert.mockResolvedValue({ id: "line-account-id" });
    prismaMock.$transaction.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("invalidates older unused invitations before creating a replacement", async () => {
    prismaMock.tenantUser.findFirst.mockResolvedValue({
      id: tenantId,
      fullName: "Tenant One",
      roomNumber: "101",
    });

    const result = await createTenantLineInvite(apartmentId, adminId, tenantId);

    expect(prismaMock.lineLinkInvite.updateMany).toHaveBeenCalledWith({
      where: { tenantId, usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
    expect(prismaMock.$transaction).toHaveBeenCalledWith([
      expect.anything(),
      expect.anything(),
    ]);
    expect(result.connectUrl).toMatch(/^https:\/\/app\.example\.com\/tenant\/line-connect\?invite=.+/);
  });

  it("invalidates every outstanding invitation after a successful LINE callback", async () => {
    prismaMock.lineLinkInvite.findFirst.mockResolvedValue({
      id: "invite-id",
      tenantId,
      tenant: { apartmentId, roomNumber: "101", apartment: { name: "ABC Apartment" } },
    });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "user-token" }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ userId: "U-line-user", displayName: "Tenant LINE" }),
      })
      .mockResolvedValueOnce({ ok: true }));

    await completeLineConnect("authorization-code", "oauth-state");

    expect(prismaMock.tenantLineAccount.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId },
      create: expect.objectContaining({ tenantId, apartmentId, lineUserId: "U-line-user" }),
    }));
    expect(prismaMock.lineLinkInvite.updateMany).toHaveBeenCalledWith({
      where: { tenantId, usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
    expect(fetch).toHaveBeenLastCalledWith(
      "https://api.line.me/v2/bot/message/push",
      expect.objectContaining({ body: expect.stringContaining("ABC Apartment") }),
    );
  });

  it("disconnects only a tenant in the admin apartment and invalidates pending invitations", async () => {
    prismaMock.tenantUser.findFirst.mockResolvedValue({ id: tenantId });
    prismaMock.tenantLineAccount.updateMany.mockResolvedValue({ count: 1 });

    await disconnectTenantLine(apartmentId, tenantId);

    expect(prismaMock.tenantUser.findFirst).toHaveBeenCalledWith({
      where: { id: tenantId, apartmentId },
      select: { id: true },
    });
    expect(prismaMock.tenantLineAccount.updateMany).toHaveBeenCalledWith({
      where: { tenantId, isActive: true },
      data: { isActive: false, unlinkedAt: expect.any(Date) },
    });
    expect(prismaMock.lineLinkInvite.updateMany).toHaveBeenCalledWith({
      where: { tenantId, usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
  });

  it("does not disconnect a tenant from another apartment", async () => {
    prismaMock.tenantUser.findFirst.mockResolvedValue(null);

    await expect(disconnectTenantLine(apartmentId, tenantId)).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("uses black, red, and green LINE cards for new, overdue, and paid bills", async () => {
    prismaMock.lineNotification.findUnique.mockResolvedValue({
      id: "notification-id",
      attemptCount: 0,
      bill: {
        id: "bill-id", apartmentId, tenantId, tenantName: "Tenant One", roomNumber: "101",
        billingPeriod: new Date("2026-09-01T00:00:00.000Z"), totalAmount: 250,
        dueDate: new Date("2026-10-05T00:00:00.000Z"), status: "SENT",
        apartment: { name: "ABC Apartment" },
        items: [{ name: "ค่าปรับล่าช้า", quantity: 5, unitPrice: 50, amount: 250 }],
        tenant: { lineAccount: { lineUserId: "U-line-user", isActive: true, blockedAt: null } },
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    await sendBillLineNotification("bill-id", "BILL_CREATED");
    expect(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body)).toContain('"backgroundColor":"#111827"');
    vi.mocked(fetch).mockClear();

    await sendBillLineNotification("bill-id", "BILL_OVERDUE");

    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(String(request?.body)).toContain('"backgroundColor":"#B91C1C"');
    expect(String(request?.body)).toContain("แจ้งเตือนบิลเกินกำหนด");
    expect(String(request?.body)).toContain("ค่าปรับล่าช้า × 5");
    expect(String(request?.body)).toContain("฿250.00");

    vi.mocked(fetch).mockClear();
    await sendBillLineNotification("bill-id", "BILL_PAID");
    expect(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body)).toContain('"backgroundColor":"#1F7A5B"');
  });
});
