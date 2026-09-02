import { Router } from "express";
import { Role } from "../generated/prisma/client.js";
import * as tenantController from "../controllers/tenant.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";

export const tenantRouter = Router();
tenantRouter.use(authenticate, requireRole(Role.TENANT));
tenantRouter.get("/dashboard", tenantController.dashboard);
tenantRouter.get("/payments", tenantController.payments);
tenantRouter.get("/profile", tenantController.profile);
tenantRouter.get("/contacts", tenantController.contacts);
tenantRouter.get("/line/status", tenantController.lineStatus);
tenantRouter.post("/line/connect/start", tenantController.startLineConnect);
