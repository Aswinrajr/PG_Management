import { io, type Socket } from 'socket.io-client';
import { api, API_ORIGIN } from './api';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_ORIGIN, { auth: (cb) => cb({ token: api.getToken() }), autoConnect: false, transports: ['websocket'] });
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
