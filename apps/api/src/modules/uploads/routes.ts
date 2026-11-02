import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { randomToken } from '../../lib/crypto.js';
import { AppError } from '../../lib/errors.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/core.js';
import { Membership } from '../orgs/model.js';
import { ResidentProfile } from '../stays/model.js';

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_PX = 1600;
const ROOT = resolve(env.UPLOAD_DIR);
const UploadBody = z.object({ kind: z.enum(['kyc', 'photo', 'bill', 'ticket']), orgId: z.string().regex(/^[a-f\d]{24}$/i) });

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1 } });

const isPdf = (buffer: Buffer) => buffer.subarray(0, 5).toString('latin1') === '%PDF-';

/** D11: files pass through the API so type and size are enforced and images are re-encoded. */
async function clean(buffer: Buffer) {
  if (isPdf(buffer)) return { data: buffer, ext: 'pdf' };
  try {
    const data = await sharp(buffer).rotate().resize({ width: MAX_IMAGE_PX, height: MAX_IMAGE_PX, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    return { data, ext: 'webp' };
  } catch {
    throw new AppError('VALIDATION_ERROR', 'Upload an image or a PDF', 400);
  }
}

export const uploadRoutes = Router();

uploadRoutes.post('/', requireAuth, upload.single('file'), validate({ body: UploadBody }), async (req, res) => {
  if (!req.file) throw new AppError('VALIDATION_ERROR', 'No file received', 400);
  const { kind, orgId } = req.valid.body;
  const member = await Membership.exists({ userId: req.auth!.userId, orgId, status: 'active' });
  if (!member) throw new AppError('FORBIDDEN', 'You do not have access to this organization', 403);
  const { data, ext } = await clean(req.file.buffer);
  const key = `${orgId}/${kind}/${randomToken(16)}.${ext}`;
  const path = join(ROOT, key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
  res.status(201).json({ success: true, data: { key } });
});

export const fileRoutes = Router();

fileRoutes.get('/*key', requireAuth, async (req, res) => {
  const key = (req.params.key as unknown as string[]).join('/');
  if (!/^[a-f\d]{24}\/(kyc|photo|bill|ticket)\/[\w-]+\.(webp|pdf)$/i.test(key)) throw new AppError('NOT_FOUND', 'Not found', 404);
  const [orgId, kind] = key.split('/') as [string, string];
  const memberships = await Membership.find({ userId: req.auth!.userId, orgId, status: 'active' }).lean();
  const isOwner = memberships.some((m) => m.role === 'owner');
  if (!req.auth!.isSuperAdmin && !isOwner && (kind === 'kyc' ? true : memberships.length === 0)) {
    const ownKyc = kind === 'kyc' && memberships.length > 0 && (await ownsKyc(req.auth!.userId, orgId, key));
    if (!ownKyc) throw new AppError('FORBIDDEN', 'You do not have access to this file', 403);
  }
  const file = await readFile(join(ROOT, key)).catch(() => null);
  if (!file) throw new AppError('NOT_FOUND', 'Not found', 404);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('Content-Disposition', 'inline');
  res.type(key.endsWith('.pdf') ? 'application/pdf' : 'image/webp').send(file);
});

async function ownsKyc(userId: string, orgId: string, key: string) {
  return ResidentProfile.exists({ orgId, userId, $or: [{ idFrontKey: key }, { idBackKey: key }] });
}
