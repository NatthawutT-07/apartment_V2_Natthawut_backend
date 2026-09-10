import { Router } from "express";
import { Role } from "../generated/prisma/client.js";
import * as superadminController from "../controllers/superadmin.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";

export const superadminRouter = Router();

superadminRouter.use(authenticate, requireRole(Role.SUPER_ADMIN));
superadminRouter.get("/apartments", superadminController.portfolio);
superadminRouter.post("/apartments", superadminController.createApartmentAdmin);
superadminRouter.get("/registrations", superadminController.registrations);
superadminRouter.post("/registrations/:registrationId/approve", superadminController.approveRegistration);
superadminRouter.post("/registrations/:registrationId/reject", superadminController.rejectRegistration);
superadminRouter.get("/custom-plan-inquiries", superadminController.customPlanInquiries);
superadminRouter.patch("/custom-plan-inquiries/:inquiryId/status", superadminController.updateCustomPlanInquiryStatus);
superadminRouter.patch("/admins/:adminId/status", superadminController.updateAdminStatus);
superadminRouter.patch(
  "/apartments/:apartmentId/admins/:adminId/access",
  superadminController.adjustAdminAccess,
);
superadminRouter.get(
  "/apartments/:apartmentId/admins/:adminId/rooms",
  superadminController.adminApartmentRooms,
);
superadminRouter.get("/line-settings", superadminController.lineSettings);
superadminRouter.put("/line-settings", superadminController.saveLineSettings);
superadminRouter.post("/line-settings/test", superadminController.testLineSettings);
