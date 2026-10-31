import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useGet, useSend } from '@/lib/api';
import { Button, Card, Empty, ErrorText, Field, Page, Query, Row, T, useTheme } from '@/lib/ui';

const clock = (value: string) => new Date(value).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const istDay = (shift: number) => new Date(Date.now() + 5.5 * 3600_000 + shift * 86400_000).toISOString().slice(0, 10);

function MyBooking({ booking }: { booking: any }) {
  const action = useSend<string>('post', (name) => `/me/machine-bookings/${booking._id}/${name}`);
  const running = booking.status === 'running';
  return (
    <Card>
      <View style={{ gap: 8 }}>
        <T weight="600">{booking.machineName}</T>
        <T muted>{running ? `Ends about ${clock(booking.expectedEndAt)}` : `${clock(booking.startAt)}, ${booking.expectedMinutes} min`}</T>
        <ErrorText error={action.error} />
        {running ? <Button title="I have finished" loading={action.isPending} onPress={() => action.mutate('finish')} /> : (
          <>
            <Button title="Start wash" loading={action.isPending} onPress={() => action.mutate('start')} />
            <Button title="Cancel slot" variant="secondary" onPress={() => action.mutate('cancel')} />
          </>
        )}
      </View>
    </Card>
  );
}

export default function Laundry() {
  const c = useTheme();
  const [shift, setShift] = useState(0);
  const machines = useGet<any[]>(`/me/machines?date=${istDay(shift)}`, { retry: false, refetchInterval: 30_000 });
  const mine = useGet<any[]>('/me/machine-bookings', { retry: false, refetchInterval: 30_000 });
  const [picked, setPicked] = useState<{ machine: any; slot: string } | null>(null);
  const [minutes, setMinutes] = useState('45');
  const book = useSend('post', () => `/me/machines/${picked?.machine._id}/book`);
  return (
    <Page title="Laundry" onRefresh={() => void machines.refetch()} refreshing={machines.isRefetching}>
      {mine.data?.map((b) => <MyBooking key={b._id} booking={b} />)}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button title="Today" variant={shift === 0 ? 'primary' : 'secondary'} onPress={() => setShift(0)} />
        <Button title="Tomorrow" variant={shift === 1 ? 'primary' : 'secondary'} onPress={() => setShift(1)} />
      </View>
      {picked && (
        <Card>
          <View style={{ gap: 12 }}>
            <T weight="600">{picked.machine.name} at {clock(picked.slot)}</T>
            <Field label="Expected time (minutes)" keyboardType="number-pad" value={minutes} onChangeText={setMinutes} />
            <ErrorText error={book.error} />
            <Button title="Book slot" loading={book.isPending} onPress={() => book.mutate({ startAt: picked.slot, expectedMinutes: Number(minutes) }, { onSuccess: () => setPicked(null) })} />
            <Button title="Back" variant="secondary" onPress={() => setPicked(null)} />
          </View>
        </Card>
      )}
      <Query query={machines}>
        {(list) =>
          list.length === 0 ? <Empty title="No machines yet" text="Your PG has not added a washing machine." /> : (
            <>
              {list.map((machine) => (
                <Card key={machine._id}>
                  <View style={{ gap: 8 }}>
                    <T weight="600">{machine.name}</T>
                    {machine.running && <T color={c.warningText}>{machine.running.mine ? 'Your wash is running' : `${machine.running.name} is using it`} · ends about {clock(machine.running.expectedEndAt)}</T>}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {machine.slots.filter((s: any) => !s.past).map((slot: any) => (
                        <Pressable key={slot.startAt} disabled={Boolean(slot.name)} accessibilityRole="button" onPress={() => setPicked({ machine, slot: slot.startAt })} style={{ width: 96, minHeight: 48, padding: 4, justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: slot.mine ? c.primary : c.border, backgroundColor: slot.name ? c.surfaceMuted : 'transparent' }}>
                          <T size={12} weight="600" center>{clock(slot.startAt)}</T>
                          <T size={11} muted center>{slot.mine ? 'Yours' : (slot.name ?? 'Free')}</T>
                        </Pressable>
                      ))}
                    </View>
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
