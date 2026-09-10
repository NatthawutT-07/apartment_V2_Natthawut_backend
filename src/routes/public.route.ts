import { Router } from "express";
import * as registrationController from "../controllers/registration.controller.js";

export const publicRouter = Router();
publicRouter.post("/registrations", registrationController.register);
publicRouter.post("/custom-plan-inquiries", registrationController.customPlanInquiry);
