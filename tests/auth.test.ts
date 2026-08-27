import bcrypt from "bcrypt";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
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
const userId = "10000000-0000-4000-8000-000000000000";

const admin = {
  id: userId,
  username: "admin",
  phone: null,
  role: Role.APARTMENT_ADMIN,
  apartmentId,
  mustChangePassword: true,
  passwordHash,
  isActive: true,
  apartment: { isActive: true },
};

function tokenFor(overrides: Record<string, unknown> = {}) {
  return jwt.sign(
    { userId, role: Role.APARTMENT_ADMIN, apartmentId, ...overrides },
    process.env.JWT_SECRET!,
    { algorithm: "HS256", expiresIn: "1h" },
  );
}

describe("authentication API", () => {
  beforeEach(() => {
    prismaMock.user.findUnique.mockReset();
    prismaMock.user.update.mockReset();
  });

  it("logs in an active user without exposing passwordHash", async () => {
    prismaMock.user.findUnique.mockResolvedValue(admin);

    const response = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password });

    expect(response.status).toBe(200);
    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.user).toMatchObject({
      id: userId,
      username: "admin",
      role: Role.APARTMENT_ADMIN,
      apartmentId,
      mustChangePassword: true,
    });
    expect(response.body.user).not.toHaveProperty("passwordHash");

    const decoded = jwt.verify(response.body.accessToken, process.env.JWT_SECRET!);
    expect(decoded).toMatchObject({ userId, role: Role.APARTMENT_ADMIN, apartmentId });
    expect(decoded).not.toHaveProperty("username");
    expect((decoded as jwt.JwtPayload).exp).toBeGreaterThan((decoded as jwt.JwtPayload).iat!);
  });

  it("returns the same generic error for an unknown username and wrong password", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(admin);

    const unknown = await request(app)
      .post("/api/auth/login")
      .send({ username: "unknown", password });
    const wrongPassword = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "WrongPass123!" });

    expect(unknown.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
    expect(unknown.body).toEqual({ message: "Invalid username or password" });
    expect(wrongPassword.body).toEqual(unknown.body);
  });

  it.each([
    { ...admin, isActive: false },
    { ...admin, apartment: { isActive: false } },
  ])("rejects inactive users and apartments", async (record) => {
    prismaMock.user.findUnique.mockResolvedValue(record);

    const response = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ message: "Invalid username or password" });
  });

  it("requires a JWT for /me", async () => {
    const response = await request(app).get("/api/auth/me");

    expect(response.status).toBe(401);
  });

  it("returns the current user for a valid, tenant-scoped JWT", async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce({
        role: Role.APARTMENT_ADMIN,
        apartmentId,
        isActive: true,
        apartment: { isActive: true },
      })
      .mockResolvedValueOnce({
        id: userId,
        username: "admin",
        phone: null,
        role: Role.APARTMENT_ADMIN,
        apartmentId,
        mustChangePassword: true,
      });

    const response = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${tokenFor()}`);

    expect(response.status).toBe(200);
    expect(response.body.user.apartmentId).toBe(apartmentId);
    expect(response.body.user).not.toHaveProperty("passwordHash");
  });

  it("rejects a token whose apartment claim differs from the database", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      role: Role.APARTMENT_ADMIN,
      apartmentId,
      isActive: true,
      apartment: { isActive: true },
    });

    const response = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${tokenFor({ apartmentId: "other-apartment" })}`);

    expect(response.status).toBe(401);
  });

  it("changes a password and clears mustChangePassword", async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce({
        role: Role.APARTMENT_ADMIN,
        apartmentId,
        isActive: true,
        apartment: { isActive: true },
      })
      .mockResolvedValueOnce({ passwordHash });
    prismaMock.user.update.mockResolvedValue({});

    const response = await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${tokenFor()}`)
      .send({ currentPassword: password, newPassword: "NewStrongPass456!" });

    expect(response.status).toBe(200);
    const update = prismaMock.user.update.mock.calls[0]?.[0];
    expect(update.data.mustChangePassword).toBe(false);
    expect(update.data.passwordHash).not.toBe(password);
    expect(await bcrypt.compare("NewStrongPass456!", update.data.passwordHash)).toBe(true);
  });

  it("validates login input", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ username: "", password: "" });

    expect(response.status).toBe(400);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("rejects a client-supplied apartmentId", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password, apartmentId: "another-apartment" });

    expect(response.status).toBe(400);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });
});

describe("role middleware", () => {
  const roleApp = express();
  roleApp.get(
    "/admin",
    authenticate,
    requireRole(Role.SUPER_ADMIN),
    (_request, response) => response.json({ ok: true }),
  );

  it("forbids a valid apartment admin token from a super-admin route", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      role: Role.APARTMENT_ADMIN,
      apartmentId,
      isActive: true,
      apartment: { isActive: true },
    });

    const response = await request(roleApp)
      .get("/admin")
      .set("Authorization", `Bearer ${tokenFor()}`);

    expect(response.status).toBe(403);
  });

  it("allows a valid super-admin token into a super-admin route", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      role: Role.SUPER_ADMIN,
      apartmentId: null,
      isActive: true,
      apartment: null,
    });
    const token = jwt.sign(
      { userId, role: Role.SUPER_ADMIN },
      process.env.JWT_SECRET!,
      { algorithm: "HS256", expiresIn: "1h" },
    );

    const response = await request(roleApp)
      .get("/admin")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });
});
