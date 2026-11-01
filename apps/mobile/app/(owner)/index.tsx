import { formatINR } from '@roomora/types';
import { BedDouble, CircleDollarSign, Percent, ReceiptIndianRupee } from 'lucide-react-native';
import { View } from 'react-native';
import { useGet } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge, Card, Money, Page, Query, Row, Stat, T, useTheme } from '@/lib/ui';

export default function OwnerHome() {
  const { orgPath, workspace } = useAuth();
  const c = useTheme();
  const query = useGet<any>(orgPath('/dashboard'));
  return (
    <Page title="Dashboard" subtitle={workspace?.orgName} onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <Query query={query}>
        {(data) => (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              <Stat label="Occupancy" value={`${data.occupancyPct}%`} icon={<Percent size={18} color={c.primary} />} tint={c.primary} />
              <Stat label="Vacant beds" value={String(data.beds.vacant)} icon={<BedDouble size={18} color={c.secondary} />} tint={c.secondary} delay={60} />
              <Stat label="Collected" value={formatINR(data.month.collectedPaise)} icon={<CircleDollarSign size={18} color={c.success} />} tint={c.success} delay={120} />
              <Stat label="Pending" value={formatINR(data.month.pendingPaise)} icon={<ReceiptIndianRupee size={18} color={c.warning} />} tint={c.warning} delay={180} />
            </View>
            <T weight="700">Rent due this week</T>
            {data.dueThisWeek.length === 0 ? <Card><T muted>Nothing due this week.</T></Card> : data.dueThisWeek.map((i: any) => <Card key={i._id}><Row><T>{i.number}</T><Money paise={i.balancePaise} weight="600" /></Row></Card>)}
            <T weight="700">Open complaints</T>
            {data.openTickets.length === 0 ? <Card><T muted>No open complaints.</T></Card> : data.openTickets.map((t: any) => <Card key={t._id}><Row><T>{t.title}</T><Badge status={t.status} /></Row></Card>)}
          </>
        )}
      </Query>
    </Page>
  );
}
