import { useGetPage, useSend } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { AccountCard } from '@/lib/settings';
import { Badge, Button, Card, Page, Query, Row, T } from '@/lib/ui';

const NEXT: Record<string, [string, string] | undefined> = { open: ['in_progress', 'Start work'], in_progress: ['resolved', 'Mark resolved'], resolved: ['closed', 'Close'] };

function Ticket({ ticket }: { ticket: any }) {
  const { orgPath } = useAuth();
  const update = useSend('patch', orgPath(`/tickets/${ticket._id}`));
  const next = NEXT[ticket.status];
  return (
    <Card>
      <Row><T>{ticket.title}</T><Badge status={ticket.status} /></Row>
      {next && <Button title={next[1]} variant="secondary" loading={update.isPending} onPress={() => update.mutate({ status: next[0] })} />}
    </Card>
  );
}

export default function More() {
  const { orgPath } = useAuth();
  const query = useGetPage<any>(orgPath('/tickets?limit=30'));
  return (
    <Page title="More" onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <AccountCard />
      <T weight="600">Complaints</T>
      <Query query={query}>
        {({ items }) => (items.length === 0 ? <T muted>No complaints.</T> : <>{items.map((t) => <Ticket key={t._id} ticket={t} />)}</>)}
      </Query>
    </Page>
  );
}
