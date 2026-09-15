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
}));

vi.mock("../src/lib/prisma.js", () => ({ prisma: prismaMock }));

import { completeLineConnect, createTenantLineInvite, disconnectTenantLine } from "../src/services/line.service.js";

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
});
