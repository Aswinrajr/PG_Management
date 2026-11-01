import { formatINR } from '@roomora/types';
import { useRouter } from 'expo-router';
import { BedDouble, Building2, CircleDollarSign, FileCheck2, IndianRupee, Percent } from 'lucide-react-native';
import { View } from 'react-native';
import { useGet } from '@/lib/api';
import { Badge, Card, Page, Query, Row, Stat, T, useTheme } from '@/lib/ui';

export default function AdminHome() {
  const c = useTheme();
  const router = useRouter();
  const query = useGet<any>('/admin/dashboard');
  return (
    <Page title="Platform" subtitle="All PGs on Roomora" onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <Query query={query}>
        {(d) => (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              <Stat label="PG owners" value={String(d.orgs.total)} icon={<Building2 size={18} color={c.primary} />} tint={c.primary} />
              <Stat label="To review" value={String(d.pendingKyc)} icon={<FileCheck2 size={18} color={c.warning} />} tint={c.warning} delay={60} />
              <Stat label="Beds" value={String(d.beds)} icon={<BedDouble size={18} color={c.secondary} />} tint={c.secondary} delay={120} />
              <Stat label="Occupancy" value={`${d.occupancyPct}%`} icon={<Percent size={18} color={c.info} />} tint={c.info} delay={180} />
              <Stat label="Rent collected" value={formatINR(d.rentGmvPaise)} icon={<IndianRupee size={18} color={c.success} />} tint={c.success} delay={240} />
              <Stat label="Monthly revenue" value={formatINR(d.mrrPaise)} icon={<CircleDollarSign size={18} color={c.accent} />} tint={c.accent} delay={300} />
            </View>
            <T weight="700">Latest signups</T>
            {d.latestSignups.map((o: any) => <Card key={o._id} onPress={() => router.push(`/admin-org/${o._id}`)}><Row><T weight="600">{o.name}</T><Badge status={o.status} /></Row><T size={12} muted>{o.city}</T></Card>)}
          </>
        )}
      </Query>
    </Page>
  );
}
