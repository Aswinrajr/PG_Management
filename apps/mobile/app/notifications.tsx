import { useRouter } from 'expo-router';
import { Bell, ChevronRight } from 'lucide-react-native';
import { useEffect } from 'react';
import { View } from 'react-native';
import { useGet, useSend } from '@/lib/api';
import { appRoute } from '@/lib/links';
import { Button, Card, Empty, Page, Query, T, useTheme } from '@/lib/ui';

const day = (value: string) => new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });

export default function Notifications() {
  const c = useTheme();
  const router = useRouter();
  const query = useGet<{ unread: number; items: { _id: string; title: string; body: string; link?: string; createdAt: string }[] }>('/auth/notifications');
  const markRead = useSend('post', '/auth/notifications/read');
  const unread = query.data?.unread ?? 0;

  useEffect(() => {
    if (unread) markRead.mutate({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread]);

  return (
    <Page title="Notifications" bell={false} onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <Query query={query}>
        {({ items }) =>
          items.length === 0 ? <Empty title="Nothing new" /> : (
            <>
              {items.map((n) => {
                const route = appRoute(n.link);
                return (
                  <Card key={n._id} onPress={route ? () => router.push(route as never) : undefined}>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Bell size={18} color={c.primary} /></View>
                      <View style={{ flex: 1 }}>
                        <T weight="700">{n.title}</T>
                        <T muted>{n.body}</T>
                        <T size={12} muted>{day(n.createdAt)}</T>
                      </View>
                      {route && <ChevronRight size={20} color={c.textMuted} />}
                    </View>
                  </Card>
                );
              })}
            </>
          )
        }
      </Query>
      <Button title="Back" variant="secondary" onPress={() => router.back()} />
    </Page>
  );
}
