import { Router } from "express";
import * as authController from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

export const authRouter = Router();

authRouter.post("/admin/login", authController.loginAdmin);
authRouter.post("/tenant/login", authController.loginTenant);
authRouter.get("/me", authenticate, authController.me);
authRouter.post("/admin/switch-apartment", authenticate, authController.switchApartment);
authRouter.post("/change-password", authenticate, authController.changePassword);
