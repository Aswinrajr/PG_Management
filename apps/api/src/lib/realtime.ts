import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { verifyAccessToken } from '../modules/auth/tokens.js';
import { Game } from '../modules/community/model.js';

let io: Server | null = null;

export function initRealtime(server: HttpServer) {
  io = new Server(server, { cors: { origin: env.APP_URL, credentials: true } });

  io.use(async (socket, next) => {
    try {
      const claims = await verifyAccessToken(String(socket.handshake.auth.token));
      socket.data.userId = claims.sub;
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    void socket.join(`user:${socket.data.userId}`);

    // Only players of a game may listen to its chat.
    socket.on('game:join', async (gameId: string, ack?: (ok: boolean) => void) => {
      const valid = typeof gameId === 'string' && /^[a-f\d]{24}$/i.test(gameId);
      const game = valid && (await Game.exists({ _id: gameId, 'players.userId': socket.data.userId }).setOptions({ skipTenant: true }));
      if (game) await socket.join(`game:${gameId}`);
      ack?.(Boolean(game));
    });
    socket.on('game:leave', (gameId: string) => void socket.leave(`game:${gameId}`));
  });
  return io;
}

export const emitToUser = (userId: unknown, event: string, data: unknown) => io?.to(`user:${userId}`).emit(event, data);
export const emitToGame = (gameId: unknown, event: string, data: unknown) => io?.to(`game:${gameId}`).emit(event, data);
