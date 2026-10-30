import { SPORTS } from '@roomora/types';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarDays, MapPin, Send, Trophy, Users } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { Button, Card, EmptyState, Field, FormError, Input, Money, PageHeader, Query, Select, Sheet, Textarea, cx } from '../../components/ui';
import { api, useGet, useSend } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { rupeesToPaise } from '../../lib/format';
import { getSocket } from '../../lib/socket';

const when = (value: string) =>
  new Date(value).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

function HostSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ title: '', sport: 'football', venue: '', startsAt: '', maxPlayers: '10', cost: '', notes: '' });
  const save = useSend('post', '/me/games');
  const bind = (key: keyof typeof form) => ({ value: form[key], onChange: (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value }) });
  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate(
      { title: form.title, sport: form.sport, venue: form.venue, startsAt: new Date(form.startsAt), maxPlayers: Number(form.maxPlayers), costPerHeadPaise: rupeesToPaise(form.cost || 0), notes: form.notes },
      { onSuccess: onClose },
    );
  }
  return (
    <Sheet open={open} onClose={onClose} title={t('Host a game')}>
      <form onSubmit={submit} className="space-y-3">
        <Field label={t('Title')}><Input placeholder={t('Sunday turf football')} {...bind('title')} /></Field>
        <Field label={t('Sport')}><Select {...bind('sport')}>{SPORTS.map((s) => <option key={s} value={s}>{t(s)}</option>)}</Select></Field>
        <Field label={t('Venue')}><Input placeholder={t('Play Arena, HSR')} {...bind('venue')} /></Field>
        <Field label={t('Date and time')}><Input type="datetime-local" {...bind('startsAt')} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('Players')}><Input type="number" min={2} max={50} {...bind('maxPlayers')} /></Field>
          <Field label={t('Cost per person (₹)')}><Input inputMode="numeric" {...bind('cost')} /></Field>
        </div>
        <Field label={t('Notes')}><Textarea rows={2} {...bind('notes')} /></Field>
        <FormError error={save.error} />
        <Button type="submit" block loading={save.isPending} disabled={form.title.length < 3 || !form.venue || !form.startsAt}>{t('Host game')}</Button>
      </form>
    </Sheet>
  );
}

function GameCard({ game }: { game: any }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const join = useSend('post', `/me/games/${game._id}/join`);
  const spots = game.maxPlayers - game.players.length;
  return (
    <Card className="rounded-lg">
      <div className="mb-2 flex items-start justify-between gap-2">
        <h2 className="min-w-0 font-semibold">{game.title}</h2>
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium capitalize text-primary"><Trophy className="size-3" aria-hidden /> {t(game.sport)}</span>
      </div>
      <ul className="space-y-1 text-sm text-text-muted">
        <li className="flex items-center gap-2"><CalendarDays className="size-4 shrink-0" aria-hidden /> {when(game.startsAt)}</li>
        <li className="flex items-center gap-2"><MapPin className="size-4 shrink-0" aria-hidden /> {game.venue}</li>
        <li className="flex items-center gap-2"><Users className="size-4 shrink-0" aria-hidden /> {t('{{count}} of {{max}} joined', { count: game.players.length, max: game.maxPlayers })}</li>
      </ul>
      {game.costPerHeadPaise > 0 && <p className="mt-1 text-sm"><Money paise={game.costPerHeadPaise} /> {t('per person')}</p>}
      <FormError error={join.error} />
      <div className="mt-3">
        {game.joined ? (
          <Link to={`/me/games/${game._id}`}><Button variant="secondary" block>{t('Open chat')}</Button></Link>
        ) : (
          <Button block disabled={spots <= 0} loading={join.isPending} onClick={() => join.mutate({}, { onSuccess: () => navigate(`/me/games/${game._id}`) })}>{spots > 0 ? t('Join game') : t('Game is full')}</Button>
        )}
      </div>
    </Card>
  );
}

export function GamesPage() {
  const { t } = useTranslation();
  const query = useGet<any[]>('/me/games', { retry: false });
  const [hosting, setHosting] = useState(false);
  return (
    <div className="mx-auto max-w-[960px] text-base">
      <PageHeader title={t('Games')} subtitle={t('Play with people from your PG.')} actions={<Button onClick={() => setHosting(true)}>{t('Host a game')}</Button>} />
      <Query query={query}>
        {(games) =>
          games.length === 0 ? <EmptyState title={t('No games yet')} text={t('Host the first one and get a team together.')} /> : (
            <div className="grid gap-4 md:grid-cols-2">{games.map((game) => <GameCard key={game._id} game={game} />)}</div>
          )
        }
      </Query>
      {hosting && <HostSheet open onClose={() => setHosting(false)} />}
    </div>
  );
}

export function GameChatPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { me } = useAuth();
  const navigate = useNavigate();
  const client = useQueryClient();
  const path = `/me/games/${id}`;
  const query = useGet<{ game: any; messages: any[] }>(path, { retry: false, staleTime: 0 });
  const [live, setLive] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState<Error | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const leave = useSend('post', `${path}/leave`);
  const cancel = useSend('post', `${path}/cancel`);

  useEffect(() => {
    const socket = getSocket();
    const join = () => socket.emit('game:join', id);
    const onMessage = (message: any) => setLive((list) => (list.some((m) => m._id === message._id) ? list : [...list, message]));
    const onPlayers = () => void client.invalidateQueries({ queryKey: [path] });
    socket.on('connect', join); // also rejoins after a dropped connection
    socket.on('game:message', onMessage);
    socket.on('game:players', onPlayers);
    if (socket.connected) join();
    return () => {
      socket.emit('game:leave', id);
      socket.off('connect', join);
      socket.off('game:message', onMessage);
      socket.off('game:players', onPlayers);
    };
  }, [id, path, client]);

  const saved = query.data?.messages ?? [];
  const messages = [...saved, ...live.filter((m) => !saved.some((s) => s._id === m._id))];

  useEffect(() => {
    void end.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText('');
    setError(null);
    try {
      await api.post(`${path}/messages`, { text: body });
    } catch (err) {
      setText(body);
      setError(err as Error);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-9.5rem)] max-w-[760px] flex-col text-base md:h-[calc(100dvh-8rem)]">
      <Query query={query}>
        {({ game }) => (
          <>
            <div className="mb-3 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h1 className="truncate text-xl font-bold">{game.title}</h1>
                <p className="truncate text-sm text-text-muted">{when(game.startsAt)} · {game.venue}</p>
                <p className="truncate text-sm text-text-muted">{game.players.map((p: any) => p.name).join(', ')}</p>
              </div>
              {game.isHost ? (
                <Button variant="secondary" loading={cancel.isPending} onClick={() => cancel.mutate({}, { onSuccess: () => navigate('/me/games') })}>{t('Cancel game')}</Button>
              ) : (
                <Button variant="secondary" loading={leave.isPending} onClick={() => leave.mutate({}, { onSuccess: () => navigate('/me/games') })}>{t('Leave')}</Button>
              )}
            </div>
            <div role="log" aria-label={t('Chat')} className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-lg border border-border bg-surface p-3">
              {messages.length === 0 && <p className="py-8 text-center text-sm text-text-muted">{t('Say hello to your team.')}</p>}
              {messages.map((m) => {
                const mine = m.userId === me?.user.id;
                return (
                  <div key={m._id} className={cx('max-w-[80%] rounded-lg px-3 py-2 text-sm', mine ? 'ml-auto bg-primary text-white dark:text-slate-950' : 'bg-surface-muted')}>
                    {!mine && <p className="text-xs font-semibold">{m.name}</p>}
                    <p className="whitespace-pre-wrap break-words">{m.text}</p>
                  </div>
                );
              })}
              <div ref={end} />
            </div>
            <FormError error={error} />
            <form onSubmit={send} className="mt-2 flex gap-2">
              <Input aria-label={t('Message')} placeholder={t('Type a message')} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />
              <Button type="submit" aria-label={t('Send')} disabled={!text.trim()}><Send className="size-4" aria-hidden /></Button>
            </form>
          </>
        )}
      </Query>
    </div>
  );
}
