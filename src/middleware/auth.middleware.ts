import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { Role } from "../generated/prisma/client.js";
import { getJwtSecret } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import type { AccountType } from "../services/auth.service.js";

type JwtPayload = {
  userId: string;
  accountType: AccountType;
  role: Role;
  apartmentId?: string;
};

function isJwtPayload(value: unknown): value is JwtPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;

  return (
    typeof payload.userId === "string" &&
    (payload.accountType === "ADMIN" || payload.accountType === "TENANT") &&
    Object.values(Role).includes(payload.role as Role) &&
    (payload.apartmentId === undefined || typeof payload.apartmentId === "string") &&
    ((payload.accountType === "TENANT" && payload.role === Role.TENANT) ||
      (payload.accountType === "ADMIN" && payload.role !== Role.TENANT))
  );
}

async function identityIsActive(identity: JwtPayload): Promise<boolean> {
  if (identity.accountType === "TENANT") {
    if (!identity.apartmentId) return false;

    const tenant = await prisma.tenantUser.findUnique({
      where: { id: identity.userId },
      select: {
        apartmentId: true,
        isActive: true,
        apartment: { select: { isActive: true } },
      },
    });

    return Boolean(
      tenant?.isActive &&
        tenant.apartment.isActive &&
        tenant.apartmentId === identity.apartmentId,
    );
  }

  const now = new Date();
  const admin = await prisma.adminUser.findUnique({
    where: { id: identity.userId },
    select: {
      role: true,
      isActive: true,
      apartments: identity.apartmentId
        ? {
            where: {
              apartmentId: identity.apartmentId,
              apartment: { isActive: true },
              accessStartsAt: { lte: now },
              accessEndsAt: { gte: now },
            },
            select: { apartmentId: true },
          }
        : { select: { apartmentId: true } },
    },
  });

  if (!admin?.isActive || admin.role !== identity.role) return false;
  if (admin.role === Role.SUPER_ADMIN) return identity.apartmentId === undefined;
  return Boolean(identity.apartmentId && admin.apartments.length === 1);
}

export const authenticate: RequestHandler = async (request, response, next) => {
  const authorization = request.header("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    response.status(401).json({ message: "Authentication required" });
    return;
  }

  try {
    const token = authorization.slice("Bearer ".length);
    const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ["HS256"] });

    if (!isJwtPayload(decoded) || !(await identityIsActive(decoded))) {
      response.status(401).json({ message: "Invalid or expired token" });
      return;
    }

    request.user = decoded;
    next();
  } catch {
    response.status(401).json({ message: "Invalid or expired token" });
  }
};
