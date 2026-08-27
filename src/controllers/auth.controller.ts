import type { RequestHandler } from "express";
import * as authService from "../services/auth.service.js";
import { changePasswordSchema, loginSchema } from "../validation/auth.validation.js";

export const login: RequestHandler = async (request, response, next) => {
  try {
    const input = loginSchema.parse(request.body);
    response.json(await authService.login(input.username, input.password));
  } catch (error) {
    next(error);
  }
};

export const me: RequestHandler = async (request, response, next) => {
  try {
    response.json({ user: await authService.getCurrentUser(request.user!.userId) });
  } catch (error) {
    next(error);
  }
};

export const changePassword: RequestHandler = async (request, response, next) => {
  try {
    const input = changePasswordSchema.parse(request.body);
    await authService.changePassword(
      request.user!.userId,
      input.currentPassword,
      input.newPassword,
    );
    response.json({ message: "Password changed successfully" });
  } catch (error) {
    next(error);
  }
};

