import bcrypt from "bcrypt";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  adminUser: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  tenantUser: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  apartment: {
    findFirst: vi.fn(),
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
  apartments: [{ isPrimary: true, apartment }],
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
      prismaMock.tenantUser,
      prismaMock.apartment,
    ]) {
      for (const method of Object.values(delegate)) method.mockReset();
    }
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

  it("requires an apartment code and scopes a tenant lookup to that apartment", async () => {
    prismaMock.apartment.findFirst.mockResolvedValue({ id: apartmentId });
    prismaMock.tenantUser.findUnique.mockResolvedValue(tenant);

    const response = await request(app)
      .post("/api/auth/tenant/login")
      .send({ apartmentCode: "ABC", username: "room501", password });

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({
      accountType: "TENANT",
      role: Role.TENANT,
      apartmentId,
    });
    expect(prismaMock.apartment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ slug: "abc" }, { subdomain: "abc" }],
        }),
      }),
    );
    expect(prismaMock.tenantUser.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          apartmentId_username: { apartmentId, username: "room501" },
        },
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
    prismaMock.apartment.findFirst.mockResolvedValue({ id: apartmentId });
    prismaMock.tenantUser.findUnique.mockResolvedValue({
      ...tenant,
      apartment: { ...tenant.apartment, isActive: false },
    });

    const response = await request(app)
      .post("/api/auth/tenant/login")
      .send({ apartmentCode: "abc", username: "room501", password });

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
          { isPrimary: true, apartment },
          { isPrimary: false, apartment: otherApartment },
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
      .send({ username: "room501", password });

    expect(adminResponse.status).toBe(400);
    expect(tenantResponse.status).toBe(400);
    expect(prismaMock.adminUser.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.tenantUser.findUnique).not.toHaveBeenCalled();
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
