import type { RequestHandler } from "express";
import type { Role } from "../generated/prisma/client.js";

export function requireRole(...roles: Role[]): RequestHandler {
  return (request, response, next) => {
    if (!request.user) {
      response.status(401).json({ message: "Authentication required" });
      return;
    }

    if (!roles.includes(request.user.role)) {
      response.status(403).json({ message: "Forbidden" });
      return;
    }

    next();
  };
}

