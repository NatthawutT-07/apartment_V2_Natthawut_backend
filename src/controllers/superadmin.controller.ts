import type { RequestHandler } from "express";
import * as superadminService from "../services/superadmin.service.js";
import {
  adjustAdminAccessSchema,
  adminAccessParamsSchema,
  adminIdParamsSchema,
  createApartmentAdminSchema,
  updateAdminStatusSchema,
} from "../validation/superadmin.validation.js";
import { lineSettingsSchema } from "../validation/line.validation.js";
import * as lineService from "../services/line.service.js";
import * as registrationService from "../services/registration.service.js";
import { approveRegistrationSchema, inquiryParamsSchema, registrationParamsSchema, updateInquiryStatusSchema } from "../validation/registration.validation.js";

export const registrations: RequestHandler = async (_request, response, next) => {
  try { response.json({ registrations: await registrationService.listRegistrations() }); } catch (error) { next(error); }
};

export const approveRegistration: RequestHandler = async (request, response, next) => {
  try {
    const { registrationId } = registrationParamsSchema.parse(request.params);
    response.json(await registrationService.approveRegistration(registrationId, approveRegistrationSchema.parse(request.body)));
  } catch (error) { next(error); }
};

export const rejectRegistration: RequestHandler = async (request, response, next) => {
  try {
    const { registrationId } = registrationParamsSchema.parse(request.params);
    await registrationService.rejectRegistration(registrationId);
    response.status(204).end();
  } catch (error) { next(error); }
};

export const customPlanInquiries: RequestHandler = async (_request, response, next) => {
  try { response.json({ inquiries: await registrationService.listCustomPlanInquiries() }); } catch (error) { next(error); }
};

export const updateCustomPlanInquiryStatus: RequestHandler = async (request, response, next) => {
  try {
    const { inquiryId } = inquiryParamsSchema.parse(request.params);
    const { status } = updateInquiryStatusSchema.parse(request.body);
    await registrationService.updateCustomPlanInquiryStatus(inquiryId, status);
    response.json({ ok: true });
  } catch (error) { next(error); }
};

export const portfolio: RequestHandler = async (_request, response, next) => {
  try {
    response.json(await superadminService.getApartmentPortfolio());
  } catch (error) {
    next(error);
  }
};

export const createApartmentAdmin: RequestHandler = async (request, response, next) => {
  try {
    const input = createApartmentAdminSchema.parse(request.body);
    response.status(201).json(await superadminService.createApartmentAdmin(input));
  } catch (error) {
    next(error);
  }
};

export const updateAdminStatus: RequestHandler = async (request, response, next) => {
  try {
    const { adminId } = adminIdParamsSchema.parse(request.params);
    const { isActive } = updateAdminStatusSchema.parse(request.body);
    response.json({
      admin: await superadminService.updateApartmentAdminStatus(adminId, isActive),
    });
  } catch (error) {
    next(error);
  }
};

export const adjustAdminAccess: RequestHandler = async (request, response, next) => {
  try {
    const { apartmentId, adminId } = adminAccessParamsSchema.parse(request.params);
    const { days } = adjustAdminAccessSchema.parse(request.body);
    response.json({
      access: await superadminService.adjustApartmentAdminAccess(
        apartmentId,
        adminId,
        days,
      ),
    });
  } catch (error) {
    next(error);
  }
};

export const adminApartmentRooms: RequestHandler = async (request, response, next) => {
  try {
    const { apartmentId, adminId } = adminAccessParamsSchema.parse(request.params);
    response.json(
      await superadminService.getAdminApartmentRooms(apartmentId, adminId),
    );
  } catch (error) {
    next(error);
  }
};

export const lineSettings: RequestHandler = async (_request, response, next) => {
  try { response.json(await lineService.getPublicLineSettings()); } catch (error) { next(error); }
};

export const saveLineSettings: RequestHandler = async (request, response, next) => {
  try { response.json(await lineService.saveLineSettings(lineSettingsSchema.parse(request.body))); } catch (error) { next(error); }
};

export const testLineSettings: RequestHandler = async (_request, response, next) => {
  try { response.json(await lineService.testLineConnection()); } catch (error) { next(error); }
};
