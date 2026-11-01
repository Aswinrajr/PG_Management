import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useGetPage } from '@/lib/api';
import { Badge, Card, Empty, Field, Page, Query, Row, T } from '@/lib/ui';

export default function Owners() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const query = useGetPage<any>(`/admin/orgs?limit=50${search ? `&q=${encodeURIComponent(search)}` : ''}`);
  return (
    <Page title="PG owners" onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <Card><Field label="Search by PG name" value={search} onChangeText={setSearch} /></Card>
      <Query query={query}>
        {({ items }) =>
          items.length === 0 ? <Empty title="No PG owners found" /> : (
            <>{items.map((org) => <Card key={org._id} onPress={() => router.push(`/admin-org/${org._id}`)}><Row><T weight="700">{org.name}</T><Badge status={org.status} /></Row><T size={12} muted>{org.city}</T></Card>)}</>
          )
        }
      </Query>
    </Page>
  );
}
