import type { RequestHandler } from "express";
import * as authService from "../services/auth.service.js";
import {
  adminLoginSchema,
  changePasswordSchema,
  switchApartmentSchema,
  tenantLoginSchema,
} from "../validation/auth.validation.js";

export const loginAdmin: RequestHandler = async (request, response, next) => {
  try {
    const input = adminLoginSchema.parse(request.body);
    response.json(await authService.loginAdmin(input.username, input.password));
  } catch (error) {
    next(error);
  }
};

export const loginTenant: RequestHandler = async (request, response, next) => {
  try {
    const input = tenantLoginSchema.parse(request.body);
    response.json(await authService.loginTenant(input.username, input.password));
  } catch (error) {
    next(error);
  }
};

export const me: RequestHandler = async (request, response, next) => {
  try {
    response.json({ user: await authService.getCurrentUser(request.user!) });
  } catch (error) {
    next(error);
  }
};

export const switchApartment: RequestHandler = async (request, response, next) => {
  try {
    const input = switchApartmentSchema.parse(request.body);
    response.json(await authService.switchAdminApartment(request.user!, input.apartmentId));
  } catch (error) {
    next(error);
  }
};

export const changePassword: RequestHandler = async (request, response, next) => {
  try {
    const input = changePasswordSchema.parse(request.body);
    await authService.changePassword(
      request.user!,
      input.currentPassword,
      input.newPassword,
    );
    response.json({ message: "Password changed successfully" });
  } catch (error) {
    next(error);
  }
};
