import bcrypt from "bcrypt";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  adminUser: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  adminApartment: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  room: {
    createMany: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  apartmentBillingItem: {
    createMany: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  tenantUser: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
  },
  bill: {
    count: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  apartmentContact: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  apartment: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  lineOaConfig: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  tenantLineAccount: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
  },
  lineLinkInvite: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  lineNotification: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("../src/lib/prisma.js", () => ({ prisma: prismaMock }));

import { app } from "../src/app.js";
import { Role } from "../src/generated/prisma/client.js";
import { authenticate } from "../src/middleware/auth.middleware.js";
import { requireRole } from "../src/middleware/role.middleware.js";

const password = "StrongPass123!";
const passwordHash = await bcrypt.hash(password, 4);
const apartmentId = "20000000-0000-4000-8000-000000000000";
const otherApartmentId = "30000000-0000-4000-8000-000000000000";
const userId = "10000000-0000-4000-8000-000000000000";
const accessStartsAt = new Date("2026-01-01T00:00:00.000Z");
const accessEndsAt = new Date("2027-12-31T23:59:59.999Z");
const apartment = {
  id: apartmentId,
  name: "ABC Apartment",
  slug: "abc",
};

const admin = {
  id: userId,
  username: "owner_abc",
  phone: null,
  role: Role.APARTMENT_ADMIN,
  mustChangePassword: true,
  passwordHash,
  isActive: true,
  apartments: [{ isPrimary: true, accessStartsAt, accessEndsAt, apartment }],
};

const tenant = {
  id: userId,
  username: "room501",
  phone: null,
  apartmentId,
  mustChangePassword: true,
  passwordHash,
  isActive: true,
  apartment: { ...apartment, isActive: true },
};

function adminToken(overrides: Record<string, unknown> = {}) {
  return jwt.sign(
    {
      userId,
      accountType: "ADMIN",
      role: Role.APARTMENT_ADMIN,
      apartmentId,
      ...overrides,
    },
    process.env.JWT_SECRET!,
    { algorithm: "HS256", expiresIn: "1h" },
  );
}

function tenantToken(overrides: Record<string, unknown> = {}) {
  return jwt.sign(
    {
      userId,
      accountType: "TENANT",
      role: Role.TENANT,
      apartmentId,
      ...overrides,
    },
    process.env.JWT_SECRET!,
    { algorithm: "HS256", expiresIn: "1h" },
  );
}

describe("separated authentication API", () => {
  beforeEach(() => {
    for (const delegate of [
      prismaMock.adminUser,
      prismaMock.adminApartment,
      prismaMock.room,
      prismaMock.apartmentBillingItem,
      prismaMock.tenantUser,
      prismaMock.apartment,
    ]) {
      for (const method of Object.values(delegate)) method.mockReset();
    }
    prismaMock.$transaction.mockReset();
  });

  it("logs an apartment admin in only through the admin portal", async () => {
    prismaMock.adminUser.findUnique.mockResolvedValue(admin);

    const response = await request(app)
      .post("/api/auth/admin/login")
      .send({ username: "owner_abc", password });

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({
      id: userId,
      accountType: "ADMIN",
      role: Role.APARTMENT_ADMIN,
      apartmentId,
      apartmentName: "ABC Apartment",
    });
    expect(response.body.user).not.toHaveProperty("passwordHash");
    expect(prismaMock.tenantUser.findUnique).not.toHaveBeenCalled();

    const decoded = jwt.verify(response.body.accessToken, process.env.JWT_SECRET!);
    expect(decoded).toMatchObject({
      userId,
      accountType: "ADMIN",
      role: Role.APARTMENT_ADMIN,
      apartmentId,
    });
  });

  it("rejects an apartment admin whose access period has expired", async () => {
    prismaMock.adminUser.findUnique.mockResolvedValue({
      ...admin,
      apartments: [{
        isPrimary: true,
        accessStartsAt: new Date("2025-01-01T00:00:00.000Z"),
        accessEndsAt: new Date("2025-12-31T23:59:59.999Z"),
        apartment,
      }],
    });

    const response = await request(app)
      .post("/api/auth/admin/login")
      .send({ username: "owner_abc", password });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ message: "Invalid username or password" });
  });

  it("logs a tenant in with a globally unique username and password", async () => {
    prismaMock.tenantUser.findUnique.mockResolvedValue(tenant);

    const response = await request(app)
      .post("/api/auth/tenant/login")
      .send({ username: "room501", password });

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({
      accountType: "TENANT",
      role: Role.TENANT,
      apartmentId,
    });
    expect(prismaMock.tenantUser.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { username: "room501" },
      }),
    );
    expect(prismaMock.adminUser.findUnique).not.toHaveBeenCalled();
  });

  it("does not expose a shared legacy login endpoint", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ username: "owner_abc", password });

    expect(response.status).toBe(404);
  });

  it("returns the same error for unknown admin and wrong password", async () => {
    prismaMock.adminUser.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(admin);

    const unknown = await request(app)
      .post("/api/auth/admin/login")
      .send({ username: "unknown", password });
    const wrongPassword = await request(app)
      .post("/api/auth/admin/login")
      .send({ username: "owner_abc", password: "WrongPass123!" });

    expect(unknown.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
    expect(unknown.body).toEqual({ message: "Invalid username or password" });
    expect(wrongPassword.body).toEqual(unknown.body);
  });

  it("rejects a tenant from an inactive apartment", async () => {
    prismaMock.tenantUser.findUnique.mockResolvedValue({
      ...tenant,
      apartment: { ...tenant.apartment, isActive: false },
    });

    const response = await request(app)
      .post("/api/auth/tenant/login")
      .send({ username: "room501", password });

    expect(response.status).toBe(401);
  });

  it("returns the current tenant only when token scope matches the database", async () => {
    prismaMock.tenantUser.findUnique
      .mockResolvedValueOnce({
        apartmentId,
        isActive: true,
        apartment: { isActive: true },
      })
      .mockResolvedValueOnce(tenant);

    const response = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${tenantToken()}`);

    expect(response.status).toBe(200);
    expect(response.body.user.accountType).toBe("TENANT");
    expect(response.body.user.apartmentId).toBe(apartmentId);
  });

  it("rejects a tenant token carrying another apartment", async () => {
    prismaMock.tenantUser.findUnique.mockResolvedValue({
      apartmentId,
      isActive: true,
      apartment: { isActive: true },
    });

    const response = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${tenantToken({ apartmentId: otherApartmentId })}`);

    expect(response.status).toBe(401);
  });

  it("lets an assigned admin switch active apartment and issues a scoped token", async () => {
    const otherApartment = {
      id: otherApartmentId,
      name: "XYZ Apartment",
      slug: "xyz",
    };
    prismaMock.adminUser.findUnique
      .mockResolvedValueOnce({
        role: Role.APARTMENT_ADMIN,
        isActive: true,
        apartments: [{ apartmentId }],
      })
      .mockResolvedValueOnce({
        ...admin,
        apartments: [
          { isPrimary: true, accessStartsAt, accessEndsAt, apartment },
          { isPrimary: false, accessStartsAt, accessEndsAt, apartment: otherApartment },
        ],
      });

    const response = await request(app)
      .post("/api/auth/admin/switch-apartment")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ apartmentId: otherApartmentId });

    expect(response.status).toBe(200);
    expect(response.body.user.apartmentId).toBe(otherApartmentId);
    const decoded = jwt.verify(response.body.accessToken, process.env.JWT_SECRET!);
    expect(decoded).toMatchObject({ accountType: "ADMIN", apartmentId: otherApartmentId });
  });

  it("changes a tenant password in the tenant table", async () => {
    prismaMock.tenantUser.findUnique
      .mockResolvedValueOnce({
        apartmentId,
        isActive: true,
        apartment: { isActive: true },
      })
      .mockResolvedValueOnce({ passwordHash });
    prismaMock.tenantUser.update.mockResolvedValue({});

    const response = await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${tenantToken()}`)
      .send({ currentPassword: password, newPassword: "NewStrongPass456!" });

    expect(response.status).toBe(200);
    expect(prismaMock.adminUser.update).not.toHaveBeenCalled();
    const update = prismaMock.tenantUser.update.mock.calls[0]?.[0];
    expect(update.data.mustChangePassword).toBe(false);
    expect(await bcrypt.compare("NewStrongPass456!", update.data.passwordHash)).toBe(true);
  });

  it("validates portal-specific login payloads", async () => {
    const adminResponse = await request(app)
      .post("/api/auth/admin/login")
      .send({ username: "owner_abc", password, apartmentCode: "abc" });
    const tenantResponse = await request(app)
      .post("/api/auth/tenant/login")
      .send({ username: "room501", password, apartmentCode: "abc" });

    expect(adminResponse.status).toBe(400);
    expect(tenantResponse.status).toBe(400);
    expect(prismaMock.adminUser.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.tenantUser.findUnique).not.toHaveBeenCalled();
  });
});

describe("super-admin apartment provisioning API", () => {
  function superAdminToken() {
    return jwt.sign(
      { userId, accountType: "ADMIN", role: Role.SUPER_ADMIN },
      process.env.JWT_SECRET!,
      { algorithm: "HS256", expiresIn: "1h" },
    );
  }

  beforeEach(() => {
    for (const delegate of [
      prismaMock.adminUser,
      prismaMock.adminApartment,
      prismaMock.room,
      prismaMock.apartmentBillingItem,
      prismaMock.apartment,
      prismaMock.lineOaConfig,
    ]) {
      for (const method of Object.values(delegate)) method.mockReset();
    }
    prismaMock.$transaction.mockReset();
  });

  it("returns real apartment and room totals to a super admin", async () => {
    prismaMock.adminUser.findUnique.mockResolvedValue({
      role: Role.SUPER_ADMIN,
      isActive: true,
      apartments: [],
    });
    prismaMock.apartment.findMany.mockResolvedValue([
      {
        id: apartmentId,
        name: "ABC Apartment",
        slug: "abc",
        totalRooms: 50,
        isActive: true,
        createdAt: new Date("2026-08-30T00:00:00.000Z"),
        adminUsers: [{
          isPrimary: true,
          accessStartsAt,
          accessEndsAt,
          adminUser: {
            id: userId,
            username: "owner_abc",
            fullName: "Owner ABC",
            phone: null,
            isActive: true,
          },
        }],
      },
    ]);

    const response = await request(app)
      .get("/api/superadmin/apartments")
      .set("Authorization", `Bearer ${superAdminToken()}`);

    expect(response.status).toBe(200);
    expect(response.body.summary).toEqual({
      totalApartments: 1,
      activeApartments: 1,
      inactiveApartments: 0,
      totalRooms: 50,
      totalAdmins: 1,
    });
    expect(response.body.apartments[0]).toMatchObject({
      name: "ABC Apartment",
      totalRooms: 50,
      admins: [{ username: "owner_abc", isPrimary: true }],
    });
  });

  it("creates the apartment, admin role, and assignment in one transaction", async () => {
    const createdAdminId = "40000000-0000-4000-8000-000000000000";
    prismaMock.adminUser.findUnique
      .mockResolvedValueOnce({
        role: Role.SUPER_ADMIN,
        isActive: true,
        apartments: [],
      })
      .mockResolvedValueOnce(null);
    prismaMock.apartment.findFirst.mockResolvedValue(null);
    prismaMock.apartment.create.mockResolvedValue({
      id: apartmentId,
      name: "Green View",
      slug: "green-view",
      totalRooms: 72,
      isActive: true,
      createdAt: new Date(),
    });
    prismaMock.adminUser.create.mockResolvedValue({
      id: createdAdminId,
      username: "owner_green",
      fullName: "Green Owner",
      phone: "0812345678",
      role: Role.APARTMENT_ADMIN,
      isActive: true,
      mustChangePassword: true,
    });
    prismaMock.room.createMany.mockResolvedValue({ count: 72 });
    prismaMock.apartmentBillingItem.createMany.mockResolvedValue({ count: 3 });
    prismaMock.adminApartment.create.mockResolvedValue({
      isPrimary: true,
      accessStartsAt,
      accessEndsAt,
    });
    prismaMock.$transaction.mockImplementation(
      (callback: (transaction: typeof prismaMock) => unknown) => callback(prismaMock),
    );

    const response = await request(app)
      .post("/api/superadmin/apartments")
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({
        apartmentName: "Green View",
        apartmentCode: "green-view",
        totalRooms: 72,
        adminFullName: "Green Owner",
        adminUsername: "owner_green",
        adminPhone: "0812345678",
        temporaryPassword: "TempPassword123!",
        accessStartDate: "2026-01-01",
        accessEndDate: "2027-12-31",
      });

    expect(response.status).toBe(201);
    expect(prismaMock.$transaction).toHaveBeenCalledOnce();
    expect(prismaMock.apartment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ totalRooms: 72, slug: "green-view" }),
    }));
    expect(prismaMock.room.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        { apartmentId, roomNumber: "001" },
        { apartmentId, roomNumber: "072" },
      ]),
    });
    const adminCreate = prismaMock.adminUser.create.mock.calls[0]?.[0];
    expect(adminCreate.data).toMatchObject({
      role: Role.APARTMENT_ADMIN,
      mustChangePassword: true,
      username: "owner_green",
    });
    expect(adminCreate.data.passwordHash).not.toBe("TempPassword123!");
    expect(await bcrypt.compare("TempPassword123!", adminCreate.data.passwordHash)).toBe(true);
    expect(prismaMock.adminApartment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        adminUserId: createdAdminId,
        apartmentId,
        isPrimary: true,
        accessStartsAt,
        accessEndsAt,
      }),
    }));
  });

  it("forbids an apartment admin from provisioning another admin", async () => {
    prismaMock.adminUser.findUnique.mockResolvedValue({
      role: Role.APARTMENT_ADMIN,
      isActive: true,
      apartments: [{ apartmentId }],
    });

    const response = await request(app)
      .post("/api/superadmin/apartments")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({
        apartmentName: "Green View",
        apartmentCode: "green-view",
        totalRooms: 72,
        adminFullName: "Green Owner",
        adminUsername: "owner_green",
        temporaryPassword: "TempPassword123!",
        accessStartDate: "2026-01-01",
        accessEndDate: "2027-12-31",
      });

    expect(response.status).toBe(403);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("lets a super admin suspend an apartment admin account", async () => {
    prismaMock.adminUser.findUnique
      .mockResolvedValueOnce({
        role: Role.SUPER_ADMIN,
        isActive: true,
        apartments: [],
      })
      .mockResolvedValueOnce({ id: userId, role: Role.APARTMENT_ADMIN });
    prismaMock.adminUser.update.mockResolvedValue({
      id: userId,
      username: "owner_abc",
      fullName: "Owner ABC",
      isActive: false,
    });

    const response = await request(app)
      .patch(`/api/superadmin/admins/${userId}/status`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ isActive: false });

    expect(response.status).toBe(200);
    expect(response.body.admin.isActive).toBe(false);
    expect(prismaMock.adminUser.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: userId },
      data: { isActive: false },
    }));
  });

  it("adds or subtracts days from an admin access end date", async () => {
    prismaMock.adminUser.findUnique.mockResolvedValue({
      role: Role.SUPER_ADMIN,
      isActive: true,
      apartments: [],
    });
    prismaMock.adminApartment.findUnique.mockResolvedValue({
      accessStartsAt,
      accessEndsAt,
      adminUser: { role: Role.APARTMENT_ADMIN },
    });
    const reducedEndDate = new Date(
      accessEndsAt.getTime() - 30 * 24 * 60 * 60 * 1_000,
    );
    prismaMock.adminApartment.update.mockResolvedValue({
      accessStartsAt,
      accessEndsAt: reducedEndDate,
    });

    const response = await request(app)
      .patch(`/api/superadmin/apartments/${apartmentId}/admins/${userId}/access`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ days: -30 });

    expect(response.status).toBe(200);
    expect(prismaMock.adminApartment.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { accessEndsAt: reducedEndDate },
    }));
    expect(response.body.access).toMatchObject({
      accessStatus: "ACTIVE",
    });
  });

  it("returns every room with occupied and available totals for an admin", async () => {
    prismaMock.adminUser.findUnique.mockResolvedValue({
      role: Role.SUPER_ADMIN,
      isActive: true,
      apartments: [],
    });
    prismaMock.adminApartment.findUnique.mockResolvedValue({
      adminUser: {
        id: userId,
        username: "owner_abc",
        fullName: "Owner ABC",
        role: Role.APARTMENT_ADMIN,
      },
      apartment: {
        id: apartmentId,
        name: "ABC Apartment",
        slug: "abc",
        rooms: [
          { id: "50000000-0000-4000-8000-000000000001", roomNumber: "101", isPlaceholder: false },
          { id: "50000000-0000-4000-8000-000000000002", roomNumber: "102", isPlaceholder: false },
          { id: "50000000-0000-4000-8000-000000000003", roomNumber: "103", isPlaceholder: false },
        ],
        tenants: [{
          id: "60000000-0000-4000-8000-000000000001",
          username: "room101",
          fullName: "Tenant One",
          roomNumber: "101",
          isActive: true,
        }],
      },
    });

    const response = await request(app)
      .get(`/api/superadmin/apartments/${apartmentId}/admins/${userId}/rooms`)
      .set("Authorization", `Bearer ${superAdminToken()}`);

    expect(response.status).toBe(200);
    expect(response.body.summary).toEqual({
      totalRooms: 3,
      occupiedRooms: 1,
      availableRooms: 2,
    });
    expect(response.body.rooms).toEqual([
      expect.objectContaining({ roomNumber: "101", status: "OCCUPIED" }),
      expect.objectContaining({ roomNumber: "102", status: "AVAILABLE", tenant: null }),
      expect.objectContaining({ roomNumber: "103", status: "AVAILABLE", tenant: null }),
    ]);
  });

  it("rejects invalid room counts before opening a transaction", async () => {
    prismaMock.adminUser.findUnique.mockResolvedValue({
      role: Role.SUPER_ADMIN,
      isActive: true,
      apartments: [],
    });

    const response = await request(app)
      .post("/api/superadmin/apartments")
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({
        apartmentName: "Green View",
        apartmentCode: "green-view",
        totalRooms: 0,
        adminFullName: "Green Owner",
        adminUsername: "owner_green",
        temporaryPassword: "TempPassword123!",
        accessStartDate: "2026-01-01",
        accessEndDate: "2027-12-31",
      });

    expect(response.status).toBe(400);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("returns LINE settings to a super admin without exposing stored secrets", async () => {
    prismaMock.adminUser.findUnique.mockResolvedValue({
      role: Role.SUPER_ADMIN,
      isActive: true,
      apartments: [],
    });
    prismaMock.lineOaConfig.findUnique.mockResolvedValue({
      id: "central",
      oaBasicId: "@apartment",
      messagingChannelId: "1234567890",
      messagingChannelSecretEncrypted: "encrypted-messaging-secret",
      messagingAccessTokenEncrypted: "encrypted-access-token",
      loginChannelId: "9876543210",
      loginChannelSecretEncrypted: "encrypted-login-secret",
      apiBaseUrl: "https://api.example.com",
      frontendBaseUrl: "https://app.example.com",
      isActive: true,
      updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    });

    const response = await request(app)
      .get("/api/superadmin/line-settings")
      .set("Authorization", `Bearer ${superAdminToken()}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      configured: true,
      oaBasicId: "@apartment",
      hasMessagingChannelSecret: true,
      hasMessagingAccessToken: true,
      hasLoginChannelSecret: true,
    });
    expect(JSON.stringify(response.body)).not.toContain("encrypted-");
  });

  it("reads LINE settings from environment variables without exposing secrets", async () => {
    const keys = [
      "LINE_CONFIG_SOURCE",
      "LINE_OA_ACTIVE",
      "LINE_OA_BASIC_ID",
      "LINE_MESSAGING_CHANNEL_ID",
      "LINE_MESSAGING_CHANNEL_SECRET",
      "LINE_MESSAGING_ACCESS_TOKEN",
      "LINE_LOGIN_CHANNEL_ID",
      "LINE_LOGIN_CHANNEL_SECRET",
      "LINE_PUBLIC_API_BASE_URL",
      "LINE_FRONTEND_BASE_URL",
    ] as const;
    const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

    try {
      Object.assign(process.env, {
        LINE_CONFIG_SOURCE: "env",
        LINE_OA_ACTIVE: "true",
        LINE_OA_BASIC_ID: "@environment-oa",
        LINE_MESSAGING_CHANNEL_ID: "messaging-channel-id",
        LINE_MESSAGING_CHANNEL_SECRET: "environment-messaging-secret",
        LINE_MESSAGING_ACCESS_TOKEN: "environment-access-token",
        LINE_LOGIN_CHANNEL_ID: "login-channel-id",
        LINE_LOGIN_CHANNEL_SECRET: "environment-login-secret",
        LINE_PUBLIC_API_BASE_URL: "https://api.example.com",
        LINE_FRONTEND_BASE_URL: "https://app.example.com",
      });
      prismaMock.adminUser.findUnique.mockResolvedValue({
        role: Role.SUPER_ADMIN,
        isActive: true,
        apartments: [],
      });

      const response = await request(app)
        .get("/api/superadmin/line-settings")
        .set("Authorization", `Bearer ${superAdminToken()}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        configured: true,
        managedByEnvironment: true,
        missingEnvironmentVariables: [],
        oaBasicId: "@environment-oa",
        messagingChannelId: "messaging-channel-id",
        loginChannelId: "login-channel-id",
        isActive: true,
      });
      expect(JSON.stringify(response.body)).not.toContain("environment-messaging-secret");
      expect(JSON.stringify(response.body)).not.toContain("environment-access-token");
      expect(JSON.stringify(response.body)).not.toContain("environment-login-secret");
      expect(prismaMock.lineOaConfig.findUnique).not.toHaveBeenCalled();
    } finally {
      for (const key of keys) {
        const value = previous[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});

describe("apartment-admin operations API", () => {
  const tenantId = "50000000-0000-4000-8000-000000000000";

  beforeEach(() => {
    for (const delegate of [
      prismaMock.adminUser,
      prismaMock.apartment,
      prismaMock.room,
      prismaMock.tenantUser,
      prismaMock.apartmentBillingItem,
      prismaMock.bill,
      prismaMock.lineNotification,
    ]) {
      for (const method of Object.values(delegate)) method.mockReset();
    }
    prismaMock.$transaction.mockReset();
    prismaMock.lineNotification.findUnique.mockResolvedValue(null);
    prismaMock.adminUser.findUnique.mockResolvedValue({
      role: Role.APARTMENT_ADMIN,
      isActive: true,
      apartments: [{ apartmentId }],
    });
  });

  it("returns apartment-scoped room cards and live occupancy totals", async () => {
    prismaMock.apartment.findUnique.mockResolvedValue({
      id: apartmentId,
      name: "ABC Apartment",
      rooms: [
        { id: "60000000-0000-4000-8000-000000000001", roomNumber: "101", floor: "1", isPlaceholder: false },
        { id: "60000000-0000-4000-8000-000000000002", roomNumber: "102", floor: "1", isPlaceholder: false },
      ],
      tenants: [{ id: tenantId, username: "room101", fullName: "Tenant One", roomNumber: "101", floor: "1", phone: "0800000000" }],
    });
    prismaMock.bill.count.mockResolvedValue(2);

    const response = await request(app)
      .get("/api/admin/dashboard")
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(response.status).toBe(200);
    expect(response.body.summary).toEqual({
      totalRooms: 2,
      occupiedRooms: 1,
      availableRooms: 1,
      unpaidBills: 2,
    });
    expect(response.body.rooms).toEqual([
      expect.objectContaining({ roomNumber: "101", status: "OCCUPIED", tenant: expect.objectContaining({ id: tenantId }) }),
      expect.objectContaining({ roomNumber: "102", status: "AVAILABLE", tenant: null }),
    ]);
    expect(prismaMock.apartment.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: apartmentId },
    }));
  });

  it("rejects a tenant username that already belongs to another apartment", async () => {
    const roomId = "60000000-0000-4000-8000-000000000001";
    prismaMock.$transaction.mockImplementation(
      (callback: (transaction: typeof prismaMock) => unknown) => callback(prismaMock),
    );
    prismaMock.room.findFirst.mockResolvedValue({ id: roomId, roomNumber: "101" });
    prismaMock.tenantUser.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "tenant-in-another-apartment" });
    prismaMock.tenantUser.findFirst.mockResolvedValue(null);

    const response = await request(app)
      .post("/api/admin/tenants")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({
        roomId,
        roomNumber: "101",
        floor: "1",
        fullName: "Tenant One",
        idCard: "1234567890123",
        phone: "0800000000",
        username: "global-user",
        password,
        moveInDate: "2026-09-01",
        moveOutDate: "",
      });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ message: "Tenant username is already in use" });
    expect(prismaMock.tenantUser.findUnique).toHaveBeenNthCalledWith(2, {
      where: { username: "global-user" },
      select: { id: true },
    });
    expect(prismaMock.tenantUser.create).not.toHaveBeenCalled();
  });

  it("creates a sent bill with server-calculated line items and total", async () => {
    prismaMock.tenantUser.findFirst.mockResolvedValue({
      id: tenantId,
      fullName: "Tenant One",
      roomNumber: "101",
    });
    prismaMock.bill.create.mockResolvedValue({
      id: "70000000-0000-4000-8000-000000000000",
      billingPeriod: new Date("2026-08-01T00:00:00.000Z"),
      status: "SENT",
      totalAmount: 1675,
    });
    prismaMock.lineNotification.upsert.mockResolvedValue({
      id: "71000000-0000-4000-8000-000000000000",
    });
    prismaMock.$transaction.mockImplementation(
      (callback: (transaction: typeof prismaMock) => unknown) => callback(prismaMock),
    );

    const response = await request(app)
      .post("/api/admin/bills")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({
        tenantId,
        billingMonth: "2026-08",
        dueDate: "2026-08-31",
        items: [
          { name: "ค่าเช่าห้อง", kind: "RENT", calculationType: "FIXED", quantity: 1, unitPrice: 1500 },
          { name: "ค่าน้ำ", kind: "WATER", calculationType: "USAGE", quantity: 10, unitPrice: 7.5 },
          { name: "ค่าไฟ", kind: "ELECTRICITY", calculationType: "USAGE", quantity: 20, unitPrice: 5 },
        ],
      });

    expect(response.status).toBe(201);
    expect(response.body.bill).toMatchObject({ status: "SENT", totalAmount: 1675 });
    expect(prismaMock.bill.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        apartmentId,
        tenantId,
        tenantName: "Tenant One",
        roomNumber: "101",
        status: "SENT",
        totalAmount: 1675,
        items: {
          create: [
            expect.objectContaining({ name: "ค่าเช่าห้อง", amount: 1500 }),
            expect.objectContaining({ name: "ค่าน้ำ", amount: 75 }),
            expect.objectContaining({ name: "ค่าไฟ", amount: 100 }),
          ],
        },
      }),
    }));
  });

  it("updates an unpaid bill and queues the revised LINE notification", async () => {
    const billId = "70000000-0000-4000-8000-000000000000";
    prismaMock.bill.findFirst.mockResolvedValue({ id: billId, tenantId, status: "SENT" });
    prismaMock.bill.update.mockResolvedValue({
      id: billId,
      tenantId,
      billingPeriod: new Date("2026-09-01T00:00:00.000Z"),
      dueDate: new Date("2026-10-08T00:00:00.000Z"),
      totalAmount: 1750,
      status: "SENT",
    });
    prismaMock.lineNotification.upsert.mockResolvedValue({ id: "notification-id" });
    prismaMock.$transaction.mockImplementation(
      (callback: (transaction: typeof prismaMock) => unknown) => callback(prismaMock),
    );

    const response = await request(app)
      .patch(`/api/admin/bills/${billId}`)
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({
        billingMonth: "2026-09",
        dueDate: "2026-10-08",
        items: [{ name: "ค่าเช่า", kind: "RENT", calculationType: "FIXED", quantity: 1, unitPrice: 1750 }],
      });

    expect(response.status).toBe(200);
    expect(prismaMock.bill.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: billId, apartmentId, status: "SENT" },
      data: expect.objectContaining({
        totalAmount: 1750,
        items: { deleteMany: {}, create: [expect.objectContaining({ amount: 1750 })] },
      }),
    }));
    expect(prismaMock.lineNotification.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { billId_eventType: { billId, eventType: "BILL_OVERDUE" } },
    }));
  });

  it("rejects tenant and billing identifiers from another apartment", async () => {
    prismaMock.tenantUser.findFirst.mockResolvedValue(null);

    const response = await request(app)
      .get(`/api/admin/tenants/${tenantId}/bill-template`)
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: "Tenant not found" });
    expect(prismaMock.tenantUser.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ apartmentId, id: tenantId }),
    }));
  });
});

describe("role middleware", () => {
  const roleApp = express();
  roleApp.get(
    "/super-admin",
    authenticate,
    requireRole(Role.SUPER_ADMIN),
    (_request, response) => response.json({ ok: true }),
  );

  beforeEach(() => {
    prismaMock.adminUser.findUnique.mockReset();
  });

  it("forbids a valid apartment admin token from a super-admin route", async () => {
    prismaMock.adminUser.findUnique.mockResolvedValue({
      role: Role.APARTMENT_ADMIN,
      isActive: true,
      apartments: [{ apartmentId }],
    });

    const response = await request(roleApp)
      .get("/super-admin")
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(response.status).toBe(403);
  });

  it("allows a valid super-admin identity", async () => {
    prismaMock.adminUser.findUnique.mockResolvedValue({
      role: Role.SUPER_ADMIN,
      isActive: true,
      apartments: [],
    });
    const token = jwt.sign(
      { userId, accountType: "ADMIN", role: Role.SUPER_ADMIN },
      process.env.JWT_SECRET!,
      { algorithm: "HS256", expiresIn: "1h" },
    );

    const response = await request(roleApp)
      .get("/super-admin")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
  });
});

describe("tenant portal and payment lifecycle API", () => {
  const billId = "70000000-0000-4000-8000-000000000000";
  const contactId = "80000000-0000-4000-8000-000000000000";

  beforeEach(() => {
    for (const delegate of [prismaMock.adminUser, prismaMock.tenantUser, prismaMock.bill, prismaMock.apartmentContact, prismaMock.lineNotification]) {
      for (const method of Object.values(delegate)) method.mockReset();
    }
    prismaMock.tenantUser.findUnique.mockResolvedValue({
      apartmentId,
      isActive: true,
      apartment: { isActive: true },
    });
    prismaMock.$transaction.mockReset();
    prismaMock.$transaction.mockImplementation(
      (callback: (transaction: typeof prismaMock) => unknown) => callback(prismaMock),
    );
    prismaMock.lineNotification.findUnique.mockResolvedValue(null);
    prismaMock.lineNotification.upsert.mockResolvedValue({ id: "71000000-0000-4000-8000-000000000000" });
  });

  it("shows the current sent bill and its line items to only that tenant", async () => {
    prismaMock.tenantUser.findFirst.mockResolvedValue({
      id: userId,
      username: "room501",
      fullName: "Somchai Tenant",
      roomNumber: "501",
      floor: "5",
      phone: "0812345678",
      moveInDate: new Date("2026-08-01T00:00:00.000Z"),
      moveOutDate: null,
      apartment: { id: apartmentId, name: "ABC Apartment", slug: "abc" },
    });
    prismaMock.bill.findMany.mockResolvedValue([{
      id: billId,
      billingPeriod: new Date("2026-08-01T00:00:00.000Z"),
      totalAmount: 1675,
      issuedAt: new Date("2026-08-25T00:00:00.000Z"),
      dueDate: new Date("2026-08-31T00:00:00.000Z"),
      status: "SENT",
      items: [{ id: "90000000-0000-4000-8000-000000000000", name: "ค่าน้ำ", kind: "WATER", calculationType: "USAGE", quantity: 10, unitPrice: 7.5, amount: 75 }],
    }]);

    const response = await request(app)
      .get("/api/tenant/dashboard")
      .set("Authorization", `Bearer ${tenantToken()}`);

    expect(response.status).toBe(200);
    expect(response.body.tenant).toMatchObject({ fullName: "Somchai Tenant", roomNumber: "501" });
    expect(response.body.currentBill).toMatchObject({ id: billId, status: "SENT", totalAmount: 1675 });
    expect(response.body.currentBill.items[0]).toMatchObject({ name: "ค่าน้ำ", quantity: 10, amount: 75 });
    expect(response.body.unpaidBills).toHaveLength(1);
    expect(response.body.totalUnpaid).toBe(1675);
    expect(prismaMock.bill.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: userId, apartmentId, status: "SENT" },
    }));
  });

  it("returns no current bill after all bills are paid", async () => {
    prismaMock.tenantUser.findFirst.mockResolvedValue({
      id: userId,
      username: "room501",
      fullName: "Somchai Tenant",
      roomNumber: "501",
      floor: "5",
      phone: null,
      moveInDate: new Date(),
      moveOutDate: null,
      apartment: { id: apartmentId, name: "ABC Apartment", slug: "abc" },
    });
    prismaMock.bill.findMany.mockResolvedValue([]);

    const response = await request(app)
      .get("/api/tenant/dashboard")
      .set("Authorization", `Bearer ${tenantToken()}`);

    expect(response.status).toBe(200);
    expect(response.body.currentBill).toBeNull();
  });

  it("returns only active contacts from the tenant apartment", async () => {
    prismaMock.apartmentContact.findMany.mockResolvedValue([{
      id: contactId,
      label: "ช่างไฟ",
      contactName: "Somchai Electric",
      channel: "PHONE",
      value: "0812345678",
      note: "ติดต่อช่วง 08:00-18:00",
    }]);

    const response = await request(app)
      .get("/api/tenant/contacts")
      .set("Authorization", `Bearer ${tenantToken()}`);

    expect(response.status).toBe(200);
    expect(response.body.contacts[0]).toMatchObject({ label: "ช่างไฟ", channel: "PHONE" });
    expect(prismaMock.apartmentContact.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { apartmentId, isActive: true },
    }));
  });

  it("lets the apartment admin confirm payment for tenant history", async () => {
    prismaMock.tenantUser.findUnique.mockReset();
    prismaMock.adminUser.findUnique.mockResolvedValue({
      role: Role.APARTMENT_ADMIN,
      isActive: true,
      apartments: [{ apartmentId }],
    });
    prismaMock.bill.findFirst.mockResolvedValue({ id: billId, status: "SENT" });
    prismaMock.bill.update.mockResolvedValue({ id: billId, tenantId: userId, status: "PAID", paidAt: new Date() });

    const response = await request(app)
      .patch(`/api/admin/bills/${billId}/paid`)
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(response.status).toBe(200);
    expect(response.body.bill.status).toBe("PAID");
    expect(prismaMock.bill.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: billId, apartmentId, status: "SENT" },
      data: expect.objectContaining({ status: "PAID", paidAt: expect.any(Date) }),
    }));
  });
});
