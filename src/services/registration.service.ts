import { RegistrationPlan, RegistrationStatus } from "../generated/prisma/client.js";
import { AppError } from "../errors/app-error.js";
import { prisma } from "../lib/prisma.js";
import type { ApproveRegistrationInput, CustomPlanInquiryInput, RegistrationInput } from "../validation/registration.validation.js";
import { createApartmentAdmin } from "./superadmin.service.js";

const startOfToday = () => { const date = new Date(); date.setUTCHours(0, 0, 0, 0); return date; };
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

export async function createRegistration(input: RegistrationInput) {
  const duplicate = await prisma.adminRegistration.findFirst({ where: { email: input.email, status: RegistrationStatus.PENDING }, select: { id: true } });
  if (duplicate) throw new AppError(409, "An application for this email is already pending");
  return prisma.adminRegistration.create({ data: { ...input, birthDate: new Date(`${input.birthDate}T00:00:00.000Z`) }, select: { id: true, status: true, plan: true, createdAt: true } });
}

export async function listRegistrations() {
  return prisma.adminRegistration.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }] });
}

function accessEnd(plan: RegistrationPlan, start: Date) {
  const end = new Date(start);
  if (plan === RegistrationPlan.FREE_30_DAYS) end.setUTCDate(end.getUTCDate() + 29);
  if (plan === RegistrationPlan.TRIAL_3_MONTHS) end.setUTCMonth(end.getUTCMonth() + 3);
  if (plan === RegistrationPlan.FULL_1_YEAR) end.setUTCFullYear(end.getUTCFullYear() + 1);
  return end;
}

export async function approveRegistration(registrationId: string, input: ApproveRegistrationInput) {
  const registration = await prisma.adminRegistration.findUnique({ where: { id: registrationId } });
  if (!registration) throw new AppError(404, "Registration not found");
  if (registration.status !== RegistrationStatus.PENDING) throw new AppError(409, "Registration has already been reviewed");
  const start = startOfToday();
  const result = await createApartmentAdmin({
    apartmentName: registration.apartmentNameTh,
    apartmentCode: input.apartmentCode,
    totalRooms: registration.totalRooms,
    adminFullName: `${registration.firstNameTh} ${registration.lastNameTh}`,
    adminUsername: input.adminUsername,
    adminPhone: registration.phone,
    temporaryPassword: input.temporaryPassword,
    accessStartDate: isoDate(start),
    accessEndDate: isoDate(accessEnd(registration.plan, start)),
  });
  await prisma.adminRegistration.update({ where: { id: registrationId }, data: { status: RegistrationStatus.APPROVED, approvedAt: new Date(), approvedAdminId: result.admin.id, approvedApartmentId: result.apartment.id } });
  return result;
}

export async function rejectRegistration(registrationId: string) {
  const result = await prisma.adminRegistration.updateMany({ where: { id: registrationId, status: RegistrationStatus.PENDING }, data: { status: RegistrationStatus.REJECTED, rejectedAt: new Date() } });
  if (!result.count) throw new AppError(404, "Pending registration not found");
}

export async function createCustomPlanInquiry(input: CustomPlanInquiryInput) {
  return prisma.customPlanInquiry.create({ data: input, select: { id: true, status: true, createdAt: true } });
}

export async function listCustomPlanInquiries() {
  return prisma.customPlanInquiry.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }] });
}

export async function updateCustomPlanInquiryStatus(inquiryId: string, status: "NEW" | "CONTACTED" | "CLOSED") {
  const result = await prisma.customPlanInquiry.updateMany({
    where: { id: inquiryId },
    data: {
      status,
      contactedAt: status === "CONTACTED" ? new Date() : undefined,
      closedAt: status === "CLOSED" ? new Date() : undefined,
    },
  });
  if (!result.count) throw new AppError(404, "Inquiry not found");
}
