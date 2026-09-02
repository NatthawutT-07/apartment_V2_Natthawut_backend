import type { RequestHandler } from "express";
import * as superadminService from "../services/superadmin.service.js";
import {
  adjustAdminAccessSchema,
  adminAccessParamsSchema,
  adminIdParamsSchema,
  createApartmentAdminSchema,
  updateAdminStatusSchema,
} from "../validation/superadmin.validation.js";

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
