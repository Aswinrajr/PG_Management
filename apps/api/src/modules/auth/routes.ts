import { SendOtpBody, UpdateMeBody, VerifyOtpBody } from '@roomora/types';
import { Router, type CookieOptions, type Request } from 'express';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { requireAuth } from '../../middleware/auth.js';
import { rateLimit, validate } from '../../middleware/core.js';
import { Notification } from '../ops/model.js';
import { User } from '../users/model.js';
import { loadMemberships, logout, publicUser, refresh, sendOtp, verifyOtp } from './service.js';

const COOKIE = 'roomora_refresh';
const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/api/v1/auth',
  maxAge: env.JWT_REFRESH_TTL_DAYS * 86400_000,
};

const clientOf = (req: Request) => ({ userAgent: req.headers['user-agent'], ip: req.ip });
const refreshTokenOf = (req: Request): string | undefined => req.cookies?.[COOKIE] ?? req.body?.refreshToken;

export const authRoutes = Router();

authRoutes.post('/otp/send', rateLimit('otp-ip', 20, 3600), validate({ body: SendOtpBody }), async (req, res) => {
  res.json({ success: true, data: await sendOtp(req.valid.body.phone) });
});

authRoutes.post('/otp/verify', rateLimit('otp-verify-ip', 30, 3600), validate({ body: VerifyOtpBody }), async (req, res) => {
  const { refreshToken, ...data } = await verifyOtp(req.valid.body, clientOf(req));
  res.cookie(COOKIE, refreshToken, cookieOptions);
  res.json({ success: true, data: { ...data, ...(req.headers['x-client'] === 'mobile' && { refreshToken }) } });
});

authRoutes.post('/refresh', async (req, res) => {
  const { accessToken, refreshToken } = await refresh(refreshTokenOf(req), clientOf(req));
  res.cookie(COOKIE, refreshToken, cookieOptions);
  res.json({ success: true, data: { accessToken, ...(req.headers['x-client'] === 'mobile' && { refreshToken }) } });
});

authRoutes.post('/logout', async (req, res) => {
  await logout(refreshTokenOf(req));
  res.clearCookie(COOKIE, { path: cookieOptions.path });
  res.json({ success: true, data: {} });
});

authRoutes.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.auth!.userId).lean();
  if (!user) throw new AppError('UNAUTHORIZED', 'Please log in', 401);
  res.json({
    success: true,
    data: { user: publicUser(user), memberships: await loadMemberships(String(user._id)), isSuperAdmin: Boolean(user.isSuperAdmin), impersonatedBy: req.auth!.impersonatedBy },
  });
});

authRoutes.patch('/me', requireAuth, validate({ body: UpdateMeBody }), async (req, res) => {
  const user = await User.findByIdAndUpdate(req.auth!.userId, req.valid.body, { new: true }).lean();
  res.json({ success: true, data: publicUser(user!) });
});

authRoutes.get('/notifications', requireAuth, async (req, res) => {
  const userId = req.auth!.userId;
  const [items, unread] = await Promise.all([
    Notification.find({ userId }).sort({ createdAt: -1 }).limit(30).lean(),
    Notification.countDocuments({ userId, readAt: null }),
  ]);
  res.json({ success: true, data: { items, unread } });
});

authRoutes.post('/notifications/read', requireAuth, async (req, res) => {
  await Notification.updateMany({ userId: req.auth!.userId, readAt: null }, { readAt: new Date() });
  res.json({ success: true, data: {} });
});
