import { formatINR } from '@roomora/types';
import { View } from 'react-native';
import { useGet } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge, Card, Money, Page, Query, Row, T } from '@/lib/ui';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexBasis: '48%', flexGrow: 1 }}>
      <Card>
        <T size={12} muted>{label}</T>
        <T size={20} weight="700">{value}</T>
      </Card>
    </View>
  );
}

export default function OwnerHome() {
  const { orgPath, workspace } = useAuth();
  const query = useGet<any>(orgPath('/dashboard'));
  return (
    <Page title="Dashboard" subtitle={workspace?.orgName} onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <Query query={query}>
        {(data) => (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Stat label="Occupancy" value={`${data.occupancyPct}%`} />
              <Stat label="Vacant beds" value={String(data.beds.vacant)} />
              <Stat label="Collected" value={formatINR(data.month.collectedPaise)} />
              <Stat label="Pending" value={formatINR(data.month.pendingPaise)} />
            </View>
            <T weight="600">Rent due this week</T>
            {data.dueThisWeek.length === 0 ? <T muted>Nothing due this week.</T> : data.dueThisWeek.map((i: any) => <Card key={i._id}><Row><T>{i.number}</T><Money paise={i.balancePaise} weight="600" /></Row></Card>)}
            <T weight="600">Open complaints</T>
            {data.openTickets.length === 0 ? <T muted>No open complaints.</T> : data.openTickets.map((t: any) => <Card key={t._id}><Row><T>{t.title}</T><Badge status={t.status} /></Row></Card>)}
          </>
        )}
      </Query>
    </Page>
  );
}
