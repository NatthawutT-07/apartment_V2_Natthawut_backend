import type { Role } from "../generated/prisma/client.js";
import type { AccountType } from "../services/auth.service.js";

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        accountType: AccountType;
        role: Role;
        apartmentId?: string;
      };
    }
  }
}

export {};
