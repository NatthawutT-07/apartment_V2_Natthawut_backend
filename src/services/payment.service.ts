import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../errors/app-error.js';
import * as storage from './storage.service.js';
import { queueBillLineNotification, sendBillLineNotification } from './line.service.js';

export async function startUpload(apartmentId: string, tenantId: string, input: { billId: string; mimeType: string; sizeBytes: number; transferredAt: string }) {
  const bill = await prisma.bill.findFirst({ where: { id: input.billId, apartmentId, tenantId, status: 'SENT' } });
  if (!bill) throw new AppError(404, 'Unpaid bill not found');
  const id = randomUUID();
  const uploadKey = `temporary/${apartmentId}/${id}`;
  const url = await storage.uploadUrl(uploadKey, input.mimeType, input.sizeBytes);
  const room = await prisma.room.findFirst({ where: { apartmentId, roomNumber: bill.roomNumber }, select: { id: true } });
  try {
    await prisma.$transaction(async tx => {
      // Release abandoned upload reservations without deleting any submitted evidence.
      await tx.paymentSubmission.updateMany({ where: { billId: bill.id, status: 'UPLOADING', createdAt: { lt: new Date(Date.now() - 15 * 60000) } }, data: { status: 'REJECTED', rejectionNote: 'Upload expired' } });
      await tx.paymentSubmission.create({ data: { id, apartmentId, tenantId, billId: bill.id, roomId: room?.id, roomNumber: bill.roomNumber, tenantName: bill.tenantName, uploadKey, mimeType: input.mimeType, sizeBytes: input.sizeBytes, transferredAt: new Date(input.transferredAt) } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppError(409, 'This bill already has a pending slip or upload. Please wait 15 minutes after an interrupted upload.');
    throw error;
  }
  return { id, uploadUrl: url };
}
export async function confirmUpload(apartmentId: string, tenantId: string, id: string) {
  const slip = await prisma.paymentSubmission.findFirst({ where: { id, apartmentId, tenantId } });
  if (!slip) throw new AppError(404, 'Slip not found');
  if (slip.status === 'PENDING') return { ok: true };
  if (slip.status !== 'UPLOADING' || slip.createdAt.getTime() < Date.now() - 15 * 60000) throw new AppError(409, 'Upload expired or already reviewed');
  const key = `slips/${apartmentId}/${slip.roomId ?? 'legacy'}/${slip.billId}/${randomUUID()}.jpg`;
  await storage.finalizeImage(slip.uploadKey, key, slip.sizeBytes);
  const changed = await prisma.paymentSubmission.updateMany({ where: { id, apartmentId, tenantId, status: 'UPLOADING', bill: { status: 'SENT' } }, data: { objectKey: key, status: 'PENDING', submittedAt: new Date() } });
  if (!changed.count) throw new AppError(409, 'Bill or submission has changed; refresh the page');
  return { ok: true };
}
export async function listSlips(apartmentId: string, tenantId: string | undefined, query: { roomNumber?: string; page: number }) {
  const items = await prisma.paymentSubmission.findMany({
    where: { apartmentId, ...(tenantId ? { tenantId } : {}), ...(query.roomNumber ? { roomNumber: query.roomNumber } : {}), objectKey: { not: null } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * 25, take: 26,
    select: { id: true, billId: true, roomNumber: true, roomId: true, tenantName: true, status: true, transferredAt: true, submittedAt: true, reviewedAt: true, reviewedById: true, rejectionNote: true, bill: { select: { totalAmount: true, billingPeriod: true, status: true } } },
  });
  return { items: items.slice(0, 25).map(item => ({ ...item, bill: { ...item.bill, totalAmount: Number(item.bill.totalAmount) } })), hasMore: items.length > 25 };
}
export async function viewSlip(apartmentId: string, tenantId: string | undefined, id: string) {
  const slip = await prisma.paymentSubmission.findFirst({ where: { id, apartmentId, ...(tenantId ? { tenantId } : {}), objectKey: { not: null } } });
  if (!slip?.objectKey) throw new AppError(404, 'Slip not found');
  return { url: await storage.downloadUrl(slip.objectKey) };
}
export async function reviewSlip(apartmentId: string, adminId: string, id: string, input: { status: 'APPROVED' | 'REJECTED'; rejectionNote?: string }) {
  const billId = await prisma.$transaction(async tx => {
    const slip = await tx.paymentSubmission.findFirst({ where: { id, apartmentId, status: 'PENDING' } });
    if (!slip) throw new AppError(409, 'Pending slip not found or already reviewed');
    if (input.status === 'APPROVED') {
      const bill = await tx.bill.updateMany({ where: { id: slip.billId, apartmentId, status: 'SENT' }, data: { status: 'PAID', paidAt: new Date() } });
      if (!bill.count) throw new AppError(409, 'Bill has already been paid or cancelled');
    }
    const changed = await tx.paymentSubmission.updateMany({ where: { id, apartmentId, status: 'PENDING' }, data: { status: input.status, reviewedById: adminId, reviewedAt: new Date(), rejectionNote: input.status === 'REJECTED' ? input.rejectionNote : null } });
    if (!changed.count) throw new AppError(409, 'Slip was already reviewed');
    const bill = await tx.bill.findUnique({ where: { id: slip.billId }, select: { tenantId: true } });
    if (input.status === 'APPROVED' && bill?.tenantId) await queueBillLineNotification(tx, slip.billId, bill.tenantId, 'BILL_PAID');
    return slip.billId;
  });
  if (input.status === 'APPROVED') void sendBillLineNotification(billId, 'BILL_PAID').catch(() => undefined);
  return { ok: true };
}
