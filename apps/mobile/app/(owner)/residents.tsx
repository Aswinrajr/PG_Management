import { useState } from 'react';
import { Linking, View } from 'react-native';
import { useGetPage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge, Button, Card, Empty, Field, Money, Page, Query, Row, T } from '@/lib/ui';

export default function Residents() {
  const { orgPath } = useAuth();
  const [search, setSearch] = useState('');
  const query = useGetPage<any>(orgPath(`/residents?limit=50${search ? `&q=${encodeURIComponent(search)}` : ''}`));
  return (
    <Page title="Residents" onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <Field label="Search name or phone" value={search} onChangeText={setSearch} />
      <Query query={query}>
        {({ items }) =>
          items.length === 0 ? <Empty title="No residents here" text="Book a bed on the Roomora website to add one." /> : (
            <>
              {items.map((r) => (
                <Card key={r.stayId}>
                  <View style={{ gap: 4 }}>
                    <Row><T weight="600">{r.name}</T><Badge status={r.status} /></Row>
                    <T muted>Room {r.room}, bed {r.bed}</T>
                    <Row><T size={12} muted>Balance</T><Money paise={r.balancePaise} weight="600" /></Row>
                    <Button title="Call" variant="secondary" onPress={() => void Linking.openURL(`tel:+${r.phone}`)} />
                  </View>
                </Card>
              ))}
            </>
          )
        }
      </Query>
    </Page>
  );
}
