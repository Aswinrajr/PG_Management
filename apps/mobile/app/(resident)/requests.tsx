import { TICKET_CATEGORIES } from '@roomora/types';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useGet, useSend } from '@/lib/api';
import { Badge, Button, Card, Empty, ErrorText, Field, Page, Query, Row, T, useTheme } from '@/lib/ui';

export default function Requests() {
  const c = useTheme();
  const query = useGet<any[]>('/me/tickets', { retry: false });
  const save = useSend('post', '/me/tickets');
  const [adding, setAdding] = useState(false);
  const [category, setCategory] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const submit = () => save.mutate({ category, title, description }, { onSuccess: () => { setAdding(false); setTitle(''); setDescription(''); setCategory(''); } });
  return (
    <Page title="Requests" onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      {adding ? (
        <Card>
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {TICKET_CATEGORIES.map((item) => (
                <Pressable key={item} accessibilityRole="button" accessibilityLabel={item} onPress={() => setCategory(item)} style={{ paddingHorizontal: 12, minHeight: 44, justifyContent: 'center', borderRadius: 22, borderWidth: 1, borderColor: category === item ? c.primary : c.border, backgroundColor: category === item ? c.primarySoft : 'transparent' }}>
                  <T>{item}</T>
                </Pressable>
              ))}
            </View>
            <Field label="What is the problem?" value={title} onChangeText={setTitle} />
            <Field label="Details" multiline value={description} onChangeText={setDescription} />
            <ErrorText error={save.error} />
            <Button title="Submit" loading={save.isPending} disabled={!category || title.trim().length < 3} onPress={submit} />
            <Button title="Cancel" variant="secondary" onPress={() => setAdding(false)} />
          </View>
        </Card>
      ) : <Button title="New request" onPress={() => setAdding(true)} />}
      <Query query={query}>
        {(rows) => (rows.length === 0 ? <Empty title="No requests yet" text="Tell us if something needs fixing." /> : <>{rows.map((t) => <Card key={t._id}><Row><T>{t.title}</T><Badge status={t.status} /></Row></Card>)}</>)}
      </Query>
    </Page>
  );
}
