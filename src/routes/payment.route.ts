import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/role.middleware.js';
import * as service from '../services/payment.service.js';
import { MAX_SLIP_BYTES } from '../services/storage.service.js';

export const uploadSchema = z.object({ billId: z.uuid(), mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']), sizeBytes: z.number().int().positive().max(MAX_SLIP_BYTES), transferredAt: z.iso.datetime({ offset: true }).refine(value => new Date(value).getTime() <= Date.now(), 'Transfer date cannot be in the future') }).strict();
export const reviewSchema = z.object({ status: z.enum(['APPROVED', 'REJECTED']), rejectionNote: z.string().trim().min(1).max(500).optional() }).strict().refine(value => value.status !== 'REJECTED' || Boolean(value.rejectionNote), 'Rejection requires a reason');
const params = z.object({ id: z.uuid() });
const query = z.object({ roomNumber: z.string().trim().min(1).max(20).optional(), page: z.coerce.number().int().min(1).max(100000).default(1) }).strict();
export const paymentRouter = Router();
paymentRouter.use(authenticate, requireRole('TENANT', 'APARTMENT_ADMIN'));
paymentRouter.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
paymentRouter.post('/upload', requireRole('TENANT'), async (req, res) => { res.status(201).json(await service.startUpload(req.user!.apartmentId!, req.user!.userId, uploadSchema.parse(req.body))); });
paymentRouter.post('/:id/confirm', requireRole('TENANT'), async (req, res) => { res.json(await service.confirmUpload(req.user!.apartmentId!, req.user!.userId, params.parse(req.params).id)); });
paymentRouter.get('/', async (req, res) => { res.json(await service.listSlips(req.user!.apartmentId!, req.user!.role === 'TENANT' ? req.user!.userId : undefined, query.parse(req.query))); });
paymentRouter.get('/:id/url', async (req, res) => { res.json(await service.viewSlip(req.user!.apartmentId!, req.user!.role === 'TENANT' ? req.user!.userId : undefined, params.parse(req.params).id)); });
paymentRouter.patch('/:id/review', requireRole('APARTMENT_ADMIN'), async (req, res) => { res.json(await service.reviewSlip(req.user!.apartmentId!, req.user!.userId, params.parse(req.params).id, reviewSchema.parse(req.body))); });
