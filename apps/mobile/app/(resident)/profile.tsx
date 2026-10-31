import { useGet } from '@/lib/api';
import { AccountCard } from '@/lib/settings';
import { Badge, Card, Page, Row, T } from '@/lib/ui';

export default function Profile() {
  const profile = useGet<any>('/me/profile', { retry: false });
  return (
    <Page title="Profile">
      <AccountCard />
      {profile.data && (
        <Card>
          <Row><T weight="600">KYC</T><Badge status={profile.data.kycStatus === 'verified' ? 'paid' : 'due'} /></Row>
          <T muted>Upload documents on the Roomora website for now.</T>
        </Card>
      )}
    </Page>
  );
}
