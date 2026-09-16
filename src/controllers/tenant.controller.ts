import type { RequestHandler } from "express";
import * as tenantService from "../services/tenant.service.js";
import * as lineService from "../services/line.service.js";

function identity(request: Parameters<RequestHandler>[0]) {
  return { tenantId: request.user!.userId, apartmentId: request.user!.apartmentId! };
}

export const dashboard: RequestHandler = async (request, response, next) => {
  try {
    const { tenantId, apartmentId } = identity(request);
    response.json(await tenantService.getTenantDashboard(tenantId, apartmentId));
  } catch (error) { next(error); }
};

export const payments: RequestHandler = async (request, response, next) => {
  try {
    const { tenantId, apartmentId } = identity(request);
    response.json({ payments: await tenantService.getPaymentHistory(tenantId, apartmentId) });
  } catch (error) { next(error); }
};

export const profile: RequestHandler = async (request, response, next) => {
  try {
    const { tenantId, apartmentId } = identity(request);
    response.json({ tenant: await tenantService.getTenantProfile(tenantId, apartmentId) });
  } catch (error) { next(error); }
};

export const contacts: RequestHandler = async (request, response, next) => {
  try { response.json({ contacts: await tenantService.getApartmentContacts(request.user!.apartmentId!) }); } catch (error) { next(error); }
};

export const lineStatus: RequestHandler = async (request, response, next) => {
  try {
    const { tenantId, apartmentId } = identity(request);
    response.json(await lineService.getTenantLineStatus(tenantId, apartmentId));
  } catch (error) { next(error); }
};

export const startLineConnect: RequestHandler = async (request, response, next) => {
  try {
    const { tenantId, apartmentId } = identity(request);
    response.json(await lineService.startTenantSelfLineConnect(tenantId, apartmentId));
  } catch (error) { next(error); }
};
