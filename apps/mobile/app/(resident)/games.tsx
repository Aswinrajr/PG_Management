import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useGet, useSend } from '@/lib/api';
import { Button, Card, Empty, ErrorText, Field, Page, Query, Row, T } from '@/lib/ui';

const when = (value: string) => new Date(value).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

function GameCard({ game }: { game: any }) {
  const router = useRouter();
  const join = useSend('post', `/me/games/${game._id}/join`);
  const open = () => router.push(`/game/${game._id}`);
  const spots = game.maxPlayers - game.players.length;
  return (
    <Card>
      <View style={{ gap: 4 }}>
        <Row><T weight="600">{game.title}</T><T size={12} muted>{game.sport}</T></Row>
        <T muted>{when(game.startsAt)}</T>
        <T muted>{game.venue}</T>
        <T size={12} muted>{game.players.length} of {game.maxPlayers} joined</T>
        <ErrorText error={join.error} />
        {game.joined ? <Button title="Open chat" variant="secondary" onPress={open} /> : <Button title={spots > 0 ? 'Join game' : 'Game is full'} disabled={spots <= 0} loading={join.isPending} onPress={() => join.mutate({}, { onSuccess: open })} />}
      </View>
    </Card>
  );
}

export default function Games() {
  const query = useGet<any[]>('/me/games', { retry: false });
  const save = useSend('post', '/me/games');
  const [hosting, setHosting] = useState(false);
  const [form, setForm] = useState({ title: '', venue: '', date: '', time: '18:00', players: '10' });
  const set = (key: keyof typeof form) => (value: string) => setForm({ ...form, [key]: value });
  const host = () => save.mutate({ title: form.title, sport: 'football', venue: form.venue, startsAt: new Date(`${form.date}T${form.time}:00+05:30`), maxPlayers: Number(form.players) }, { onSuccess: () => setHosting(false) });
  return (
    <Page title="Games" subtitle="Play with people from your PG." onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      {hosting ? (
        <Card>
          <View style={{ gap: 12 }}>
            <Field label="Title" value={form.title} onChangeText={set('title')} />
            <Field label="Venue" value={form.venue} onChangeText={set('venue')} />
            <Field label="Date" placeholder="2026-11-08" value={form.date} onChangeText={set('date')} />
            <Field label="Time" placeholder="18:00" value={form.time} onChangeText={set('time')} />
            <Field label="Players" keyboardType="number-pad" value={form.players} onChangeText={set('players')} />
            <ErrorText error={save.error} />
            <Button title="Host game" loading={save.isPending} disabled={form.title.length < 3 || !form.venue || !/^\d{4}-\d{2}-\d{2}$/.test(form.date)} onPress={host} />
            <Button title="Cancel" variant="secondary" onPress={() => setHosting(false)} />
          </View>
        </Card>
      ) : <Button title="Host a game" onPress={() => setHosting(true)} />}
      <Query query={query}>
        {(games) => (games.length === 0 ? <Empty title="No games yet" text="Host the first one." /> : <>{games.map((g) => <GameCard key={g._id} game={g} />)}</>)}
      </Query>
    </Page>
  );
}
