import { useRouter } from 'expo-router';
import { useGetPage } from '@/lib/api';
import { Badge, Card, Empty, Page, Query, Row, T, useTheme } from '@/lib/ui';

export default function KycQueue() {
  const c = useTheme();
  const router = useRouter();
  const query = useGetPage<any>('/admin/orgs?kyc=pending_review&limit=100');
  return (
    <Page title="KYC queue" subtitle="Owners waiting for approval" onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <Query query={query}>
        {({ items }) =>
          items.length === 0 ? <Empty title="Queue is clear" text="Nobody is waiting for approval." /> : (
            <>
              {items.map((org) => (
                <Card key={org._id} accent={c.warning} onPress={() => router.push(`/admin-org/${org._id}`)}>
                  <Row><T weight="700">{org.name}</T><Badge status={org.kyc.status} /></Row>
                  <T size={12} muted>{org.city}, {org.state}</T>
                </Card>
              ))}
            </>
          )
        }
      </Query>
    </Page>
  );
}
