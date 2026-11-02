import { io, type Socket } from 'socket.io-client';
import { api } from './api';

const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1';
/** Vercel cannot proxy WebSockets, so in production the socket goes straight to the API host. */
const SOCKET_URL: string = import.meta.env.VITE_SOCKET_URL ?? new URL(API_URL, window.location.href).origin;

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, { auth: (cb) => cb({ token: api.getToken() }), autoConnect: false });
    // Access tokens last 15 minutes, so a reconnect may need a fresh one.
    socket.on('connect_error', async () => {
      if (await api.refresh()) setTimeout(() => socket?.connect(), 1000);
    });
  }
  if (!socket.connected) socket.connect();
  return socket;
}

export function closeSocket() {
  socket?.disconnect();
  socket = null;
}

const toKey = (base64: string) => {
  const raw = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=').replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window;

/** Asks for permission and registers this browser for push alerts. */
export async function enablePush() {
  const { publicKey } = await api.get<{ publicKey: string | null }>('/me/push/key');
  if (!publicKey) throw new Error('Push alerts are not set up on the server yet');
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('Allow notifications in your browser to get alerts');
  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) });
  const { endpoint, keys } = subscription.toJSON();
  await api.post('/me/push/subscribe', { endpoint, keys });
}
