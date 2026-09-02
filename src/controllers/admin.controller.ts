import type { RequestHandler } from "express";
import * as adminService from "../services/admin.service.js";
import {
  billingItemParamsSchema,
  billParamsSchema,
  billingItemSchema,
  contactParamsSchema,
  contactSchema,
  createBillSchema,
  createTenantSchema,
  tenantParamsSchema,
} from "../validation/admin.validation.js";
import { lineBillParamsSchema, lineTenantParamsSchema } from "../validation/line.validation.js";
import * as lineService from "../services/line.service.js";

function apartmentId(request: Parameters<RequestHandler>[0]) {
  return request.user!.apartmentId!;
}

export const dashboard: RequestHandler = async (request, response, next) => {
  try { response.json(await adminService.getDashboard(apartmentId(request))); } catch (error) { next(error); }
};
export const billingItems: RequestHandler = async (request, response, next) => {
  try { response.json({ items: await adminService.listBillingItems(apartmentId(request)) }); } catch (error) { next(error); }
};
export const createBillingItem: RequestHandler = async (request, response, next) => {
  try { response.status(201).json({ item: await adminService.createBillingItem(apartmentId(request), billingItemSchema.parse(request.body)) }); } catch (error) { next(error); }
};
export const updateBillingItem: RequestHandler = async (request, response, next) => {
  try {
    const { itemId } = billingItemParamsSchema.parse(request.params);
    response.json({ item: await adminService.updateBillingItem(apartmentId(request), itemId, billingItemSchema.parse(request.body)) });
  } catch (error) { next(error); }
};
export const deleteBillingItem: RequestHandler = async (request, response, next) => {
  try {
    const { itemId } = billingItemParamsSchema.parse(request.params);
    await adminService.deleteBillingItem(apartmentId(request), itemId);
    response.status(204).end();
  } catch (error) { next(error); }
};
export const tenants: RequestHandler = async (request, response, next) => {
  try { response.json({ tenants: await adminService.listTenants(apartmentId(request)) }); } catch (error) { next(error); }
};
export const tenantFormOptions: RequestHandler = async (request, response, next) => {
  try { response.json(await adminService.getTenantFormOptions(apartmentId(request))); } catch (error) { next(error); }
};
export const createTenant: RequestHandler = async (request, response, next) => {
  try { response.status(201).json(await adminService.createTenant(apartmentId(request), createTenantSchema.parse(request.body))); } catch (error) { next(error); }
};
export const deleteTenant: RequestHandler = async (request, response, next) => {
  try {
    const { tenantId } = tenantParamsSchema.parse(request.params);
    await adminService.deleteTenant(apartmentId(request), tenantId);
    response.status(204).end();
  } catch (error) { next(error); }
};
export const billTemplate: RequestHandler = async (request, response, next) => {
  try {
    const { tenantId } = tenantParamsSchema.parse(request.params);
    response.json(await adminService.getBillTemplate(apartmentId(request), tenantId));
  } catch (error) { next(error); }
};
export const createBill: RequestHandler = async (request, response, next) => {
  try { response.status(201).json({ bill: await adminService.createBill(apartmentId(request), createBillSchema.parse(request.body)) }); } catch (error) { next(error); }
};
export const bills: RequestHandler = async (request, response, next) => {
  try { response.json({ bills: await adminService.listBills(apartmentId(request)) }); } catch (error) { next(error); }
};
export const markBillPaid: RequestHandler = async (request, response, next) => {
  try {
    const { billId } = billParamsSchema.parse(request.params);
    response.json({ bill: await adminService.markBillPaid(apartmentId(request), billId) });
  } catch (error) { next(error); }
};
export const contacts: RequestHandler = async (request, response, next) => {
  try { response.json({ contacts: await adminService.listContacts(apartmentId(request)) }); } catch (error) { next(error); }
};
export const createContact: RequestHandler = async (request, response, next) => {
  try { response.status(201).json({ contact: await adminService.createContact(apartmentId(request), request.user!.userId, contactSchema.parse(request.body)) }); } catch (error) { next(error); }
};
export const updateContact: RequestHandler = async (request, response, next) => {
  try {
    const { contactId } = contactParamsSchema.parse(request.params);
    response.json({ contact: await adminService.updateContact(apartmentId(request), contactId, contactSchema.parse(request.body)) });
  } catch (error) { next(error); }
};
export const deleteContact: RequestHandler = async (request, response, next) => {
  try {
    const { contactId } = contactParamsSchema.parse(request.params);
    await adminService.deleteContact(apartmentId(request), contactId);
    response.status(204).end();
  } catch (error) { next(error); }
};

export const createLineInvite: RequestHandler = async (request, response, next) => {
  try {
    const { tenantId } = lineTenantParamsSchema.parse(request.params);
    response.status(201).json(await lineService.createTenantLineInvite(apartmentId(request), request.user!.userId, tenantId));
  } catch (error) { next(error); }
};

export const disconnectTenantLine: RequestHandler = async (request, response, next) => {
  try {
    const { tenantId } = lineTenantParamsSchema.parse(request.params);
    await lineService.disconnectTenantLine(apartmentId(request), tenantId);
    response.status(204).end();
  } catch (error) { next(error); }
};

export const retryBillLine: RequestHandler = async (request, response, next) => {
  try {
    const { billId } = lineBillParamsSchema.parse(request.params);
    await lineService.retryBillLineNotification(apartmentId(request), billId);
    response.json({ ok: true });
  } catch (error) { next(error); }
};
