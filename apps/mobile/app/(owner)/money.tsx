import { formatINR } from '@roomora/types';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { api, useGet } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge, Button, Card, Empty, ErrorText, Field, Page, Query, Row, T } from '@/lib/ui';
import { useQueryClient } from '@tanstack/react-query';

function RecordPayment({ due, onClose }: { due: any; onClose: () => void }) {
  const { orgPath } = useAuth();
  const client = useQueryClient();
  const [amount, setAmount] = useState(String(due.balancePaise / 100));
  const [mode, setMode] = useState<'upi' | 'cash' | 'bank'>('upi');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const key = useRef(`${due._id}-${Date.now()}`); // a double tap must not record twice

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.post(orgPath('/payments'), { stayId: due.stayId, amountPaise: Math.round(Number(amount) * 100), mode, paidAt: new Date() }, { 'Idempotency-Key': key.current });
      await client.invalidateQueries();
      onClose();
    } catch (err) {
      setError(err as Error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <View style={{ gap: 12 }}>
        <T weight="600">Record payment for {due.number}</T>
        <Field label="Amount (₹)" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['upi', 'cash', 'bank'] as const).map((m) => <Button key={m} title={m.toUpperCase()} variant={mode === m ? 'primary' : 'secondary'} onPress={() => setMode(m)} />)}
        </View>
        <ErrorText error={error} />
        <Button title="Save" loading={busy} disabled={!Number(amount)} onPress={() => void save()} />
        <Button title="Cancel" variant="secondary" onPress={onClose} />
      </View>
    </Card>
  );
}

export default function Money() {
  const { orgPath } = useAuth();
  const query = useGet<any>(orgPath('/dues'));
  const [paying, setPaying] = useState<any>(null);
  return (
    <Page title="Dues" onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      {paying && <RecordPayment key={paying._id} due={paying} onClose={() => setPaying(null)} />}
      <Query query={query}>
        {(data) => (
          <>
            <Card><T muted>Total due</T><T size={24} weight="700">{formatINR(data.totalPaise)}</T></Card>
            {data.items.length === 0 ? <Empty title="No dues" text="Everyone has paid." /> : data.items.map((due: any) => (
              <Card key={due._id} onPress={() => setPaying(due)}>
                <Row><T weight="600">{due.number}</T><T weight="600">{formatINR(due.balancePaise)}</T></Row>
                <Row><T size={12} muted>Tap to record payment</T><Badge status={due.status} /></Row>
              </Card>
            ))}
          </>
        )}
      </Query>
    </Page>
  );
}
