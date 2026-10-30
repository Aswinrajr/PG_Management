import { BellRing, Timer, WashingMachine } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, CardTitle, EmptyState, Field, FormError, Input, PageHeader, Query, Select, Sheet, Tabs, cx } from '../../components/ui';
import { useGet, useSend } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDate, todayInput } from '../../lib/format';
import { useProperties, usePropertyFilter } from '../../lib/property';
import { enablePush, pushSupported } from '../../lib/socket';

const clock = (value: string) => new Date(value).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

const dayAfter = (days: number) => new Date(Date.parse(`${todayInput()}T00:00:00Z`) + days * 86400_000).toISOString().slice(0, 10);

function Countdown({ until }: { until: string }) {
  const { t } = useTranslation();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const minutes = Math.max(0, Math.ceil((new Date(until).getTime() - now) / 60_000));
  return <span>{t('{{minutes}} min left', { minutes })}</span>;
}

function MyBooking({ booking }: { booking: any }) {
  const { t } = useTranslation();
  const action = useSend<string>('post', (name) => `/me/machine-bookings/${booking._id}/${name}`);
  const running = booking.status === 'running';
  return (
    <Card className={cx('rounded-lg', running && 'border-primary')}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">{booking.machineName}</p>
        {running && <span className="flex items-center gap-1 text-sm font-medium text-primary"><Timer className="size-4" aria-hidden /> <Countdown until={booking.expectedEndAt} /></span>}
      </div>
      <p className="text-sm text-text-muted">{running ? t('Ends about {{time}}', { time: clock(booking.expectedEndAt) }) : t('{{date}} at {{time}}, {{minutes}} min', { date: formatDate(booking.startAt), time: clock(booking.startAt), minutes: booking.expectedMinutes })}</p>
      <FormError error={action.error} />
      <div className="mt-3 flex gap-2">
        {running ? <Button block loading={action.isPending} onClick={() => action.mutate('finish')}>{t('I have finished')}</Button> : (
          <>
            <Button block loading={action.isPending} onClick={() => action.mutate('start')}>{t('Start wash')}</Button>
            <Button variant="secondary" onClick={() => action.mutate('cancel')}>{t('Cancel')}</Button>
          </>
        )}
      </div>
    </Card>
  );
}

function BookSheet({ machine, slot, onClose }: { machine: any; slot: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [minutes, setMinutes] = useState(String(Math.min(45, machine.slotMinutes)));
  const [clothes, setClothes] = useState('');
  const book = useSend('post', `/me/machines/${machine._id}/book`);
  return (
    <Sheet open onClose={onClose} title={t('{{machine}} at {{time}}', { machine: machine.name, time: clock(slot) })}>
      <div className="space-y-3">
        <Field label={t('Expected time (minutes)')} hint={t('The next person is told when this is nearly over.')}>
          <Input type="number" min={10} max={machine.slotMinutes} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        </Field>
        <Field label={t('What are you washing? (optional)')}><Input value={clothes} onChange={(e) => setClothes(e.target.value)} /></Field>
        <FormError error={book.error} />
        <Button block loading={book.isPending} onClick={() => book.mutate({ startAt: slot, expectedMinutes: Number(minutes), clothes }, { onSuccess: onClose })}>{t('Book slot')}</Button>
      </div>
    </Sheet>
  );
}

function AlertsButton() {
  const { t } = useTranslation();
  const [state, setState] = useState<'idle' | 'busy' | 'on'>(() => (typeof Notification !== 'undefined' && Notification.permission === 'granted' ? 'on' : 'idle'));
  const [error, setError] = useState<Error | null>(null);
  if (!pushSupported() || state === 'on') return null;
  return (
    <div>
      <Button
        variant="secondary"
        loading={state === 'busy'}
        onClick={async () => {
          setState('busy');
          setError(null);
          try {
            await enablePush();
            setState('on');
          } catch (err) {
            setError(err as Error);
            setState('idle');
          }
        }}
      >
        <BellRing className="size-4" aria-hidden /> {t('Turn on alerts')}
      </Button>
      <FormError error={error} />
    </div>
  );
}

export function ResidentLaundryPage() {
  const { t } = useTranslation();
  const days = [0, 1, 2].map(dayAfter);
  const [date, setDate] = useState(days[0]);
  const machines = useGet<any[]>(`/me/machines?date=${date}`, { retry: false, refetchInterval: 30_000 });
  const mine = useGet<any[]>('/me/machine-bookings', { retry: false, refetchInterval: 30_000 });
  const [picked, setPicked] = useState<{ machine: any; slot: string } | null>(null);
  return (
    <div className="mx-auto max-w-[960px] space-y-4 text-base">
      <PageHeader title={t('Laundry')} subtitle={t('Book a washing machine slot.')} actions={<AlertsButton />} />
      {mine.data?.map((booking) => <MyBooking key={booking._id} booking={booking} />)}
      <Tabs value={date} onChange={setDate} tabs={days.map((value, i) => ({ value, label: i === 0 ? t('Today') : i === 1 ? t('Tomorrow') : formatDate(value) }))} />
      <Query query={machines}>
        {(list) =>
          list.length === 0 ? <EmptyState title={t('No machines yet')} text={t('Your PG has not added a washing machine.')} /> : (
            <div className="space-y-4">
              {list.map((machine) => (
                <Card key={machine._id} className="rounded-lg">
                  <CardTitle>
                    <span className="flex items-center gap-2"><WashingMachine className="size-5 text-primary" aria-hidden /> {machine.name}</span>
                  </CardTitle>
                  {machine.running && <p className="mb-2 text-sm text-warning-text">{machine.running.mine ? t('Your wash is running') : t('{{name}} is using it', { name: machine.running.name })} · {t('ends about {{time}}', { time: clock(machine.running.expectedEndAt) })}</p>}
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {machine.slots.filter((s: any) => !s.past).map((slot: any) => (
                      <button
                        key={slot.startAt}
                        type="button"
                        disabled={Boolean(slot.name)}
                        onClick={() => setPicked({ machine, slot: slot.startAt })}
                        className={cx('min-h-11 rounded-md border p-1 text-xs font-medium', slot.mine ? 'border-primary bg-primary-soft text-primary' : slot.name ? 'border-border bg-surface-muted text-text-muted' : 'border-border hover:border-primary')}
                      >
                        <span className="block">{clock(slot.startAt)}</span>
                        <span className="block truncate font-normal">{slot.mine ? t('Yours') : slot.name ?? t('Free')}</span>
                      </button>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          )
        }
      </Query>
      {picked && <BookSheet machine={picked.machine} slot={picked.slot} onClose={() => setPicked(null)} />}
    </div>
  );
}

export function OwnerLaundryPage() {
  const { t } = useTranslation();
  const { orgPath } = useAuth();
  const properties = useProperties();
  const { propertyId } = usePropertyFilter();
  const active = propertyId || properties.data?.[0]?._id || '';
  const query = useGet<any[]>(active ? orgPath(`/machines?propertyId=${active}`) : null, { refetchInterval: 30_000 });
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', slotMinutes: '60' });
  const add = useSend('post', orgPath('/machines'));
  const update = useSend<{ id: string; status: string }>('patch', ({ id }) => orgPath(`/machines/${id}`));
  return (
    <>
      <PageHeader title={t('Laundry')} subtitle={properties.data?.find((p) => p._id === active)?.name} actions={<Button onClick={() => setAdding(true)}>{t('Add machine')}</Button>} />
      <Query query={query as never}>
        {() =>
          !query.data?.length ? <EmptyState title={t('No machines yet')} text={t('Add a washing machine so residents can book slots.')} /> : (
            <div className="grid gap-4 lg:grid-cols-2">
              {query.data.map((machine) => (
                <Card key={machine._id}>
                  <CardTitle action={<Button variant="secondary" onClick={() => update.mutate({ id: machine._id, status: machine.status === 'active' ? 'out_of_service' : 'active' })}>{machine.status === 'active' ? t('Mark out of service') : t('Mark working')}</Button>}>
                    {machine.name}
                  </CardTitle>
                  <p className="mb-2 text-sm text-text-muted">{t('{{minutes}}-minute slots', { minutes: machine.slotMinutes })}{machine.status !== 'active' ? ` · ${t('Out of service')}` : ''}</p>
                  {machine.bookings.length ? (
                    <ul className="space-y-1 text-sm">
                      {machine.bookings.map((b: any) => <li key={b._id} className="flex justify-between gap-2"><span className="truncate">{b.name}</span><span className="shrink-0 text-text-muted">{b.status === 'running' ? t('Running') : `${formatDate(b.startAt)} ${clock(b.startAt)}`}</span></li>)}
                    </ul>
                  ) : <p className="text-sm text-text-muted">{t('No bookings.')}</p>}
                </Card>
              ))}
            </div>
          )
        }
      </Query>
      <Sheet open={adding} onClose={() => setAdding(false)} title={t('Add machine')}>
        <div className="space-y-3">
          <Field label={t('Name')}><Input placeholder={t('Washer 1, 2nd floor')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label={t('Slot length')}>
            <Select value={form.slotMinutes} onChange={(e) => setForm({ ...form, slotMinutes: e.target.value })}>
              {[30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{t('{{minutes}} minutes', { minutes: m })}</option>)}
            </Select>
          </Field>
          <FormError error={add.error} />
          <Button block disabled={!form.name} loading={add.isPending} onClick={() => add.mutate({ propertyId: active, name: form.name, slotMinutes: Number(form.slotMinutes) }, { onSuccess: () => { setAdding(false); setForm({ name: '', slotMinutes: '60' }); } })}>{t('Save')}</Button>
        </div>
      </Sheet>
    </>
  );
}
