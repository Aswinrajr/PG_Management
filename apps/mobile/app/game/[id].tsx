import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, useGet } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { getSocket } from '@/lib/socket';
import { Button, ErrorText, Query, T, useTheme } from '@/lib/ui';

export default function GameChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const c = useTheme();
  const router = useRouter();
  const path = `/me/games/${id}`;
  const query = useGet<{ game: any; messages: any[] }>(path, { retry: false });
  const [live, setLive] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState<Error | null>(null);
  const scroll = useRef<any>(null);

  useEffect(() => {
    const socket = getSocket();
    const join = () => socket.emit('game:join', id);
    const onMessage = (message: any) => setLive((list) => (list.some((m) => m._id === message._id) ? list : [...list, message]));
    socket.on('connect', join); // also rejoins after a dropped connection
    socket.on('game:message', onMessage);
    if (socket.connected) join();
    return () => {
      socket.emit('game:leave', id);
      socket.off('connect', join);
      socket.off('game:message', onMessage);
    };
  }, [id]);

  const saved = query.data?.messages ?? [];
  const messages = [...saved, ...live.filter((m) => !saved.some((s) => s._id === m._id))];

  async function send() {
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
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <KeyboardAvoidingView style={{ flex: 1, padding: 12, gap: 8 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Button title="Back to games" variant="secondary" onPress={() => router.back()} />
        <Query query={query}>
          {({ game }) => <T size={18} weight="700">{game.title}</T>}
        </Query>
        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ gap: 6 }} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
          {messages.map((m) => {
            const mine = m.userId === me?.user.id;
            return (
              <View key={m._id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%', borderRadius: 12, padding: 10, backgroundColor: mine ? c.primary : c.surfaceMuted }}>
                {!mine && <T size={12} weight="600">{m.name}</T>}
                <T color={mine ? '#FFFFFF' : c.text}>{m.text}</T>
              </View>
            );
          })}
        </ScrollView>
        <ErrorText error={error} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput accessibilityLabel="Message" placeholder="Type a message" placeholderTextColor={c.textMuted} value={text} onChangeText={setText} maxLength={1000} style={{ flex: 1, minHeight: 48, borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 12, color: c.text, backgroundColor: c.surface }} />
          <View style={{ width: 88 }}><Button title="Send" disabled={!text.trim()} onPress={() => void send()} /></View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
