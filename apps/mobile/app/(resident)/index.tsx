import { formatINR } from '@roomora/types';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { CheckCircle2, Trophy, WashingMachine, Wrench } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { useGet } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge, Button, Card, Empty, FadeIn, Page, Query, Row, T, useTheme } from '@/lib/ui';

export default function Home() {
  const { me } = useAuth();
  const c = useTheme();
  const router = useRouter();
  const query = useGet<any>('/me/home', { retry: false });
  const links = [
    { to: '/(resident)/games', label: 'Games', Icon: Trophy },
    { to: '/(resident)/laundry', label: 'Laundry', Icon: WashingMachine },
    { to: '/(resident)/requests', label: 'Requests', Icon: Wrench },
  ] as const;
  return (
    <Page title={`Hi ${me?.user.name?.split(' ')[0] ?? ''} 👋`} onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      {query.isError ? <Empty title="No active stay" text="Ask your PG to book a bed for this phone number." /> : (
        <Query query={query}>
          {(home) => (
            <>
              {home.dueInvoice ? (
                <FadeIn>
                  <LinearGradient colors={['#14B8A6', '#0F766E']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 20, padding: 20, gap: 4 }}>
                    <T color="#FFFFFF">Rent due</T>
                    <T color="#FFFFFF" size={32} weight="800">{formatINR(home.balancePaise)}</T>
                    <View style={{ marginTop: 8 }}><Button title="View payments" variant="secondary" onPress={() => router.push('/(resident)/payments')} /></View>
                  </LinearGradient>
                </FadeIn>
              ) : <Card><Row><T weight="700" color={c.successText}>All paid</T><CheckCircle2 size={20} color={c.successText} /></Row></Card>}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {links.map(({ to, label, Icon }, i) => (
                  <FadeIn key={to} delay={60 * (i + 1)} style={{ flex: 1 }}>
                    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => router.push(to)} style={{ backgroundColor: c.surface, borderRadius: 16, paddingVertical: 14, alignItems: 'center', gap: 6, elevation: 3, shadowColor: '#0F172A', shadowOpacity: 0.08, shadowRadius: 12 }}>
                      <Icon size={24} color={c.primary} />
                      <T size={12} weight="600">{label}</T>
                    </Pressable>
                  </FadeIn>
                ))}
              </View>
              <Card>
                <T weight="700">My room</T>
                <T>{home.property?.name}</T>
                <T muted>Room {home.room?.number}, bed {home.bed?.label}</T>
                {home.property?.amenities?.length > 0 && <T size={12} muted>{home.property.amenities.join(' · ')}</T>}
              </Card>
              <Card>
                <T weight="700">Today's menu</T>
                {home.todaysMenu ? (['breakfast', 'lunch', 'snacks', 'dinner'] as const).map((meal) => <Row key={meal}><T muted>{meal}</T><T>{home.todaysMenu[meal] || '—'}</T></Row>) : <T muted>No menu posted.</T>}
              </Card>
              {home.latestNotice && <Card accent={c.primary}><T weight="700">{home.latestNotice.title}</T><T muted>{home.latestNotice.body}</T></Card>}
              {home.openTickets.map((ticket: any) => <Card key={ticket._id}><Row><T>{ticket.title}</T><Badge status={ticket.status} /></Row></Card>)}
            </>
          )}
        </Query>
      )}
    </Page>
  );
}
