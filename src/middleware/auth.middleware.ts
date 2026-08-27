import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { Role } from "../generated/prisma/client.js";
import { getJwtSecret } from "../config/env.js";
import { prisma } from "../lib/prisma.js";

type JwtPayload = {
  userId: string;
  role: Role;
  apartmentId?: string;
};

function isJwtPayload(value: unknown): value is JwtPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;

  return (
    typeof payload.userId === "string" &&
    Object.values(Role).includes(payload.role as Role) &&
    (payload.apartmentId === undefined || typeof payload.apartmentId === "string")
  );
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

    if (!isJwtPayload(decoded)) {
      response.status(401).json({ message: "Invalid or expired token" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        role: true,
        apartmentId: true,
        isActive: true,
        apartment: { select: { isActive: true } },
      },
    });

    const claimsMatch =
      user?.role === decoded.role &&
      (user.apartmentId ?? undefined) === decoded.apartmentId;
    const apartmentIsValid =
      user?.role === Role.SUPER_ADMIN ||
      (Boolean(user?.apartmentId) && user?.apartment?.isActive === true);

    if (!user?.isActive || !claimsMatch || !apartmentIsValid) {
      response.status(401).json({ message: "Invalid or expired token" });
      return;
    }

    request.user = decoded;
    next();
  } catch {
    response.status(401).json({ message: "Invalid or expired token" });
  }
};

