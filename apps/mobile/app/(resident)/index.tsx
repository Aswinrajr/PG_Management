import { formatINR } from '@roomora/types';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { useGet } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge, Button, Card, Empty, Page, Query, Row, T, useTheme } from '@/lib/ui';

export default function Home() {
  const { me } = useAuth();
  const c = useTheme();
  const router = useRouter();
  const query = useGet<any>('/me/home', { retry: false });
  return (
    <Page title={`Hi ${me?.user.name?.split(' ')[0] ?? ''} 👋`} onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <Query query={query}>
        {(home) => (
          <>
            {home.dueInvoice ? (
              <View style={{ backgroundColor: c.primary, borderRadius: 12, padding: 20, gap: 4 }}>
                <T color="#FFFFFF">Rent due</T>
                <T color="#FFFFFF" size={30} weight="700">{formatINR(home.balancePaise)}</T>
                <View style={{ marginTop: 8 }}><Button title="View payments" variant="secondary" onPress={() => router.push('/(resident)/payments')} /></View>
              </View>
            ) : <Card><T weight="600" color={c.successText}>All paid</T></Card>}
            <Card>
              <T weight="600">My room</T>
              <T>{home.property?.name}</T>
              <T muted>Room {home.room?.number}, bed {home.bed?.label}</T>
              {home.property?.amenities?.length > 0 && <T size={12} muted>{home.property.amenities.join(' · ')}</T>}
            </Card>
            <Card>
              <T weight="600">Today's menu</T>
              {home.todaysMenu ? (['breakfast', 'lunch', 'snacks', 'dinner'] as const).map((meal) => <Row key={meal}><T muted>{meal}</T><T>{home.todaysMenu[meal] || '—'}</T></Row>) : <T muted>No menu posted.</T>}
            </Card>
            {home.latestNotice && <Card><T weight="600">{home.latestNotice.title}</T><T muted>{home.latestNotice.body}</T></Card>}
            {home.openTickets.map((ticket: any) => <Card key={ticket._id}><Row><T>{ticket.title}</T><Badge status={ticket.status} /></Row></Card>)}
          </>
        )}
      </Query>
      {query.isError && <Empty title="No active stay" text="Ask your PG to book a bed for this phone number." />}
    </Page>
  );
}
