import { beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ paymentSubmission: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), create: vi.fn() }, bill: { findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() }, room: { findFirst: vi.fn() }, $transaction: vi.fn() }));
vi.mock('../src/lib/prisma.js', () => ({ prisma: db }));
vi.mock('../src/services/storage.service.js', () => ({ MAX_SLIP_BYTES: 5242880, uploadUrl: vi.fn().mockResolvedValue('https://storage.example/upload'), downloadUrl: vi.fn().mockResolvedValue('https://storage.example/view'), finalizeImage: vi.fn() }));
vi.mock('../src/services/line.service.js', () => ({ queueBillLineNotification: vi.fn(), sendBillLineNotification: vi.fn().mockResolvedValue(undefined) }));
import * as service from '../src/services/payment.service.js';
import * as storage from '../src/services/storage.service.js';
import { uploadSchema, reviewSchema } from '../src/routes/payment.route.js';
beforeEach(() => { vi.clearAllMocks(); db.$transaction.mockImplementation(fn => fn(db)); });
describe('payment evidence isolation and review', () => {
  it('refuses upload for a bill outside the authenticated tenant scope', async () => {
    db.bill.findFirst.mockResolvedValue(null);
    await expect(service.startUpload('apt', 'tenant', { billId: 'bill', mimeType: 'image/png', sizeBytes: 10, transferredAt: '2026-01-01T00:00:00Z' })).rejects.toMatchObject({ statusCode: 404 });
    expect(db.bill.findFirst).toHaveBeenCalledWith({ where: { id: 'bill', apartmentId: 'apt', tenantId: 'tenant', status: 'SENT' } });
    expect(storage.uploadUrl).not.toHaveBeenCalled();
  });
  it('does not issue a URL when tenant or apartment ownership does not match', async () => {
    db.paymentSubmission.findFirst.mockResolvedValue(null);
    await expect(service.viewSlip('apt', 'tenant', 'slip')).rejects.toMatchObject({ statusCode: 404 });
    expect(db.paymentSubmission.findFirst).toHaveBeenCalledWith({ where: { id: 'slip', apartmentId: 'apt', tenantId: 'tenant', objectKey: { not: null } } });
    expect(storage.downloadUrl).not.toHaveBeenCalled();
  });
  it('does not finalize an expired upload', async () => {
    db.paymentSubmission.findFirst.mockResolvedValue({ status: 'UPLOADING', createdAt: new Date(0) });
    await expect(service.confirmUpload('apt', 'tenant', 'slip')).rejects.toMatchObject({ statusCode: 409 });
    expect(storage.finalizeImage).not.toHaveBeenCalled();
  });
  it('makes confirmation retry idempotent', async () => {
    db.paymentSubmission.findFirst.mockResolvedValue({ status: 'PENDING' });
    await expect(service.confirmUpload('apt', 'tenant', 'slip')).resolves.toEqual({ ok: true });
    expect(storage.finalizeImage).not.toHaveBeenCalled();
  });
  it('refuses approval when a bill was paid or voided concurrently', async () => {
    db.paymentSubmission.findFirst.mockResolvedValue({ id: 'slip', billId: 'bill' });
    db.bill.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.reviewSlip('apt', 'admin', 'slip', { status: 'APPROVED' })).rejects.toMatchObject({ statusCode: 409 });
    expect(db.paymentSubmission.updateMany).not.toHaveBeenCalled();
  });
  it('records reviewer and atomically marks an unpaid bill paid', async () => {
    db.paymentSubmission.findFirst.mockResolvedValue({ id: 'slip', billId: 'bill' });
    db.bill.updateMany.mockResolvedValue({ count: 1 }); db.paymentSubmission.updateMany.mockResolvedValue({ count: 1 }); db.bill.findUnique.mockResolvedValue({ tenantId: null });
    await service.reviewSlip('apt', 'admin', 'slip', { status: 'APPROVED' });
    expect(db.paymentSubmission.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'slip', apartmentId: 'apt', status: 'PENDING' }, data: expect.objectContaining({ reviewedById: 'admin', status: 'APPROVED' }) }));
  });
  it('rejects unsupported files and oversized uploads', () => {
    const input = { billId: '10000000-0000-4000-8000-000000000000', transferredAt: '2026-01-01T00:00:00Z', mimeType: 'image/svg+xml', sizeBytes: 1 };
    expect(uploadSchema.safeParse(input).success).toBe(false);
    expect(uploadSchema.safeParse({ ...input, mimeType: 'image/png', sizeBytes: 5242881 }).success).toBe(false);
  });
  it('requires a rejection reason', () => { expect(reviewSchema.safeParse({ status: 'REJECTED' }).success).toBe(false); });
});
