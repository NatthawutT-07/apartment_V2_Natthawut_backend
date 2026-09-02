import type { RequestHandler } from "express";
import * as lineService from "../services/line.service.js";
import { lineCallbackSchema } from "../validation/line.validation.js";

export const webhook: RequestHandler = async (request, response, next) => {
  try {
    if (!Buffer.isBuffer(request.body)) throw new Error("LINE webhook requires a raw request body");
    await lineService.handleLineWebhook(request.body, request.header("x-line-signature"));
    response.status(200).json({ ok: true });
  } catch (error) { next(error); }
};

export const callback: RequestHandler = async (request, response, next) => {
  try {
    const { code, state } = lineCallbackSchema.parse(request.query);
    const { frontendBaseUrl } = await lineService.completeLineConnect(code, state);
    response.redirect(`${frontendBaseUrl}/tenant/line-connect?success=1`);
  } catch (error) {
    try {
      const settings = await lineService.getPublicLineSettings();
      if (settings.configured && "frontendBaseUrl" in settings) {
        response.redirect(`${settings.frontendBaseUrl}/tenant/line-connect?error=connection_failed`);
        return;
      }
    } catch { /* use the regular API error response */ }
    next(error);
  }
};
