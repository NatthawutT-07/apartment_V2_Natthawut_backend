import type { RequestHandler } from "express";
import * as registrationService from "../services/registration.service.js";
import { customPlanInquirySchema, registrationSchema } from "../validation/registration.validation.js";

export const register: RequestHandler = async (request, response, next) => {
  try { response.status(201).json({ registration: await registrationService.createRegistration(registrationSchema.parse(request.body)) }); } catch (error) { next(error); }
};

export const customPlanInquiry: RequestHandler = async (request, response, next) => {
  try { response.status(201).json({ inquiry: await registrationService.createCustomPlanInquiry(customPlanInquirySchema.parse(request.body)) }); } catch (error) { next(error); }
};
