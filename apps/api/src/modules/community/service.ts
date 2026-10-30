import { AppError } from '../../lib/errors.js';
import { emitToGame } from '../../lib/realtime.js';
import { currentStay } from '../me/service.js';
import { notify } from '../ops/service.js';
import { ResidentProfile } from '../stays/model.js';
import { Game, GameMessage } from './model.js';

const MESSAGE_PAGE = 100;

async function who(userId: string, forWrite = true) {
  const { stay, orgId } = await currentStay(userId, forWrite);
  const profile = await ResidentProfile.findOne({ orgId, _id: stay.residentProfileId }, { fullName: 1 }).lean();
  return { orgId, stay, name: profile?.fullName ?? 'Resident' };
}

const dto = (game: any, userId: string) => {
  const { players, hostUserId, ...rest } = game;
  return {
    ...rest,
    players: players.map((p: any) => ({ userId: String(p.userId), name: p.name })),
    isHost: String(hostUserId) === userId,
    joined: players.some((p: any) => String(p.userId) === userId),
  };
};

export async function listGames(userId: string) {
  const { orgId } = await who(userId, false);
  const games = await Game.find({ orgId, status: 'open', startsAt: { $gte: new Date(Date.now() - 3 * 3600_000) } }).sort({ startsAt: 1 }).limit(100).lean();
  return games.map((g) => dto(g, userId));
}

export async function createGame(userId: string, input: { startsAt: Date } & Record<string, unknown>) {
  if (input.startsAt <= new Date()) throw new AppError('VALIDATION_ERROR', 'Pick a time in the future', 400);
  const { orgId, name } = await who(userId);
  const game = await Game.create({ ...input, orgId, hostUserId: userId, players: [{ userId, name }] });
  return dto(game.toObject(), userId);
}

async function findGame(orgId: string, id: string) {
  const game = await Game.findOne({ orgId, _id: id }).lean();
  if (!game) throw new AppError('NOT_FOUND', 'Game not found', 404);
  return game;
}

export async function joinGame(userId: string, id: string) {
  const { orgId, name } = await who(userId);
  // One atomic update, so two people cannot take the last place.
  const game = await Game.findOneAndUpdate(
    { orgId, _id: id, status: 'open', 'players.userId': { $ne: userId }, $expr: { $lt: [{ $size: '$players' }, '$maxPlayers'] } },
    { $push: { players: { userId, name } } },
    { new: true },
  ).lean();
  if (!game) {
    await findGame(orgId, id);
    throw new AppError('CONFLICT', 'This game is full or you have already joined', 409);
  }
  if (String(game.hostUserId) !== userId) await notify(game.hostUserId, orgId, 'New player', `${name} joined ${game.title}`, `/me/games/${id}`);
  emitToGame(id, 'game:players', { players: game.players });
  return dto(game, userId);
}

export async function leaveGame(userId: string, id: string) {
  const { orgId } = await who(userId);
  const game = await findGame(orgId, id);
  if (String(game.hostUserId) === userId) throw new AppError('CONFLICT', 'The host can cancel the game instead', 409);
  const updated = await Game.findOneAndUpdate({ orgId, _id: id }, { $pull: { players: { userId } } }, { new: true }).lean();
  emitToGame(id, 'game:players', { players: updated!.players });
  return dto(updated, userId);
}

export async function cancelGame(userId: string, id: string) {
  const { orgId } = await who(userId);
  const game = await findGame(orgId, id);
  if (String(game.hostUserId) !== userId) throw new AppError('FORBIDDEN', 'Only the host can cancel', 403);
  await Game.updateOne({ orgId, _id: id }, { status: 'cancelled' });
  await Promise.all(game.players.filter((p) => String(p.userId) !== userId).map((p) => notify(p.userId, orgId, 'Game cancelled', `${game.title} was cancelled`, '/me/games')));
  return { cancelled: true };
}

async function playerGame(userId: string, id: string, forWrite: boolean) {
  const me = await who(userId, forWrite);
  const game = await findGame(me.orgId, id);
  if (!game.players.some((p) => String(p.userId) === userId)) throw new AppError('FORBIDDEN', 'Join the game to chat', 403);
  return { ...me, game };
}

export async function getGame(userId: string, id: string) {
  const { orgId, game } = await playerGame(userId, id, false);
  const messages = await GameMessage.find({ orgId, gameId: id }).sort({ createdAt: -1 }).limit(MESSAGE_PAGE).lean();
  return { game: dto(game, userId), messages: messages.reverse() };
}

export async function sendMessage(userId: string, id: string, text: string) {
  const { orgId, name } = await playerGame(userId, id, true);
  const message = await GameMessage.create({ orgId, gameId: id, userId, name, text });
  emitToGame(id, 'game:message', message.toObject());
  return message;
}
