import { Router } from "express";
import * as authController from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

export const authRouter = Router();

authRouter.post("/login", authController.login);
authRouter.get("/me", authenticate, authController.me);
authRouter.post("/change-password", authenticate, authController.changePassword);

