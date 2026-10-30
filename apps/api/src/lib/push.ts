import webpush from 'web-push';
import { env } from '../config/env.js';
import { PushSubscription } from '../modules/ops/model.js';
import { logger } from './logger.js';

const enabled = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
if (enabled) webpush.setVapidDetails(`mailto:support@roomora.in`, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);

export async function sendPush(userId: unknown, payload: { title: string; body: string; link?: string }) {
  if (!enabled) return;
  const subscriptions = await PushSubscription.find({ userId }).lean();
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload));
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await PushSubscription.deleteOne({ _id: sub._id }); // the browser dropped it
        else logger.warn({ err }, 'push failed');
      }
    }),
  );
}
