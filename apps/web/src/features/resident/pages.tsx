import { CheckCircle2, Hammer, Plug, ShowerHead, Soup, Sparkles, Wifi, CircleHelp, type LucideIcon } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button, Card, CardTitle, Confirm, EmptyState, ErrorState, Field, FileUpload, FormError, Input, Money, PageHeader, Query, Select, Sheet, StatusBadge, Tabs, Textarea } from '../../components/ui';
import { ApiError } from '@roomora/api-client';
import { api, useGet, useSend } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDate, formatINR, formatPeriod, todayInput } from '../../lib/format';

const NO_STAY = 'You have no active stay';

function NoStay() {
  const { t } = useTranslation();
  return <EmptyState title={t('No active stay')} text={t('Ask your PG to book a bed for this phone number.')} />;
}

const staySafe = (error: Error | null) => error instanceof ApiError && error.status === 404 && error.message === NO_STAY;

export function HomePage() {
  const { t } = useTranslation();
  const { me } = useAuth();
  const query = useGet<any>('/me/home', { retry: false });
  if (staySafe(query.error)) return <NoStay />;
  return (
    <div className="mx-auto max-w-[960px] space-y-4 text-base">
      <h1 className="text-2xl font-bold">{t('Hi {{name}}', { name: me?.user.name?.split(' ')[0] ?? '' })} 👋</h1>
      <Query query={query}>
        {(home) => (
          <>
            {home.dueInvoice ? (
              <section className="rounded-lg bg-linear-to-br from-primary to-primary-hover p-5 text-white dark:text-slate-950">
                <p>{home.dueInvoice.period ? t('Rent for {{month}}', { month: formatPeriod(home.dueInvoice.period) }) : t('Amount due')}</p>
                <p className="tabular my-1 text-[32px] font-bold leading-10">{formatINR(home.balancePaise)}</p>
                <p className="mb-3">{t('Due {{date}}', { date: formatDate(home.dueInvoice.dueDate) })}</p>
                <Link to="/me/payments"><Button variant="secondary">{t('Pay now')}</Button></Link>
              </section>
            ) : (
              <Card className="rounded-lg"><p className="flex items-center gap-2 font-semibold text-success-text"><CheckCircle2 className="size-5" aria-hidden /> {t('All paid')}</p></Card>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="rounded-lg">
                <CardTitle>{t('My room')}</CardTitle>
                <p>{home.property?.name}</p>
                <p className="text-text-muted">{t('Room {{room}}, bed {{bed}}', { room: home.room?.number, bed: home.bed?.label })}</p>
              </Card>
              <Card className="rounded-lg">
                <CardTitle>{t("Today's menu")}</CardTitle>
                {home.todaysMenu ? (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-sm">
                    {(['breakfast', 'lunch', 'snacks', 'dinner'] as const).map((meal) => <div key={meal} className="contents"><dt className="capitalize text-text-muted">{t(meal)}</dt><dd>{home.todaysMenu[meal] || '—'}</dd></div>)}
                  </dl>
                ) : <p className="text-text-muted">{t('No menu posted.')}</p>}
              </Card>
              {home.latestNotice && (
                <Card className="rounded-lg">
                  <CardTitle>{t('Latest notice')}</CardTitle>
                  <p className="font-medium">{home.latestNotice.title}</p>
                  <p className="text-text-muted">{home.latestNotice.body}</p>
                </Card>
              )}
              <Card className="rounded-lg">
                <CardTitle>{t('Open requests')}</CardTitle>
                {home.openTickets.length ? (
                  <ul className="space-y-2">{home.openTickets.map((ticket: any) => <li key={ticket._id} className="flex justify-between gap-2"><span className="truncate">{ticket.title}</span><StatusBadge kind="ticket" status={ticket.status} /></li>)}</ul>
                ) : <p className="text-text-muted">{t('None open.')}</p>}
              </Card>
            </div>
          </>
        )}
      </Query>
    </div>
  );
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function loadCheckout() {
  return new Promise<void>((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load the payment page'));
    document.body.append(script);
  });
}

function PayButton({ invoice }: { invoice: any }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [done, setDone] = useState(false);
  async function pay() {
    setBusy(true);
    setError(null);
    try {
      const order = await api.post<{ orderId: string; amountPaise: number; keyId: string }>(`/me/invoices/${invoice._id}/pay`);
      await loadCheckout();
      new window.Razorpay!({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amountPaise,
        currency: 'INR',
        name: 'Roomora',
        description: invoice.number,
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          await api.post('/me/payments/verify', { orderId: response.razorpay_order_id, paymentId: response.razorpay_payment_id, signature: response.razorpay_signature });
          setDone(true);
        },
      }).open();
    } catch (err) {
      setError(err as Error);
    } finally {
      setBusy(false);
    }
  }
  if (done) return <p className="text-success-text">{t('Payment received. It will show here shortly.')}</p>;
  return (
    <>
      <FormError error={error} />
      <Button block className="mt-2" loading={busy} onClick={pay}>{t('Pay {{amount}}', { amount: formatINR(invoice.balancePaise) })}</Button>
    </>
  );
}

export function PaymentsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'invoices' | 'history'>('invoices');
  const invoices = useGet<any[]>('/me/invoices');
  const payments = useGet<any[]>('/me/payments');
  const [open, setOpen] = useState<any>(null);
  const unpaidFirst = (rows: any[]) => [...rows].sort((a, b) => Number(b.balancePaise > 0) - Number(a.balancePaise > 0));
  return (
    <div className="mx-auto max-w-[960px] text-base">
      <PageHeader title={t('Payments')} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'invoices', label: t('Invoices') }, { value: 'history', label: t('History') }]} />
      {tab === 'invoices' && (
        <Query query={invoices}>
          {(rows) =>
            rows.length === 0 ? <EmptyState title={t('No invoices yet')} /> : (
              <ul className="space-y-2">
                {unpaidFirst(rows).map((invoice) => (
                  <li key={invoice._id}>
                    <button type="button" onClick={() => setOpen(invoice)} className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface p-4 text-left">
                      <span className="min-w-0">
                        <span className="block font-medium">{invoice.period ? formatPeriod(invoice.period) : t(invoice.type)}</span>
                        <span className="text-sm text-text-muted">{t('Due {{date}}', { date: formatDate(invoice.dueDate) })}</span>
                      </span>
                      <span className="text-right">
                        <Money paise={invoice.balancePaise || invoice.totalPaise} className="block font-semibold" />
                        <StatusBadge kind="invoice" status={invoice.status} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          }
        </Query>
      )}
      {tab === 'history' && (
        <Query query={payments}>
          {(rows) =>
            rows.length === 0 ? <EmptyState title={t('No payments yet')} /> : (
              <ul className="space-y-2">
                {rows.map((payment) => (
                  <li key={payment._id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface p-4">
                    <span className="min-w-0"><span className="block truncate font-medium">{payment.receiptNumber}</span><span className="text-sm text-text-muted">{formatDate(payment.paidAt)}</span></span>
                    <Money paise={payment.amountPaise} className="font-semibold" />
                  </li>
                ))}
              </ul>
            )
          }
        </Query>
      )}
      <Sheet open={Boolean(open)} onClose={() => setOpen(null)} title={open?.number ?? ''}>
        {open && (
          <div className="space-y-2">
            <ul className="space-y-1">{open.lineItems.map((line: any, i: number) => <li key={i} className="flex justify-between gap-2"><span>{line.label}</span><Money paise={line.amountPaise} /></li>)}</ul>
            <p className="flex justify-between border-t border-border pt-2 font-semibold"><span>{t('Balance')}</span><Money paise={open.balancePaise} /></p>
            {open.balancePaise > 0 && <PayButton invoice={open} />}
          </div>
        )}
      </Sheet>
    </div>
  );
}

const CATEGORIES: [string, LucideIcon, string][] = [
  ['electrical', Plug, 'Electrical'],
  ['plumbing', ShowerHead, 'Plumbing'],
  ['cleaning', Sparkles, 'Cleaning'],
  ['food', Soup, 'Food'],
  ['wifi', Wifi, 'WiFi'],
  ['furniture', Hammer, 'Furniture'],
  ['other', CircleHelp, 'Other'],
];

function NewRequest({ open, onClose, orgId }: { open: boolean; onClose: () => void; orgId?: string }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ category: '', title: '', description: '', priority: 'medium', photo: '' });
  const save = useSend('post', '/me/tickets');
  function submit(e: FormEvent) {
    e.preventDefault();
    const { photo, ...rest } = form;
    save.mutate({ ...rest, photos: photo ? [photo] : [] }, { onSuccess: onClose });
  }
  return (
    <Sheet open={open} onClose={onClose} title={t('New request')}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {CATEGORIES.map(([value, Icon, label]) => (
            <button key={value} type="button" aria-pressed={form.category === value} onClick={() => setForm({ ...form, category: value })} className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border text-xs ${form.category === value ? 'border-primary bg-primary-soft text-primary' : 'border-border'}`}>
              <Icon className="size-5" aria-hidden /> {t(label)}
            </button>
          ))}
        </div>
        <Field label={t('What is the problem?')}><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label={t('Details')}><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <Field label={t('Priority')}>
          <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
            <option value="low">{t('low')}</option><option value="medium">{t('medium')}</option><option value="high">{t('high')}</option><option value="urgent">{t('urgent')}</option>
          </Select>
        </Field>
        {orgId && <FileUpload label={t('Photo (optional)')} kind="ticket" orgId={orgId} value={form.photo} onChange={(photo) => setForm({ ...form, photo })} />}
        <FormError error={save.error} />
        <Button type="submit" block disabled={!form.category || form.title.length < 3} loading={save.isPending}>{t('Submit')}</Button>
      </form>
    </Sheet>
  );
}

function RequestDetail({ ticket }: { ticket: any }) {
  const { t } = useTranslation();
  const rate = useSend('post', `/me/tickets/${ticket._id}/rate`);
  const reopen = useSend('post', `/me/tickets/${ticket._id}/reopen`);
  const canRate = ['resolved', 'closed'].includes(ticket.status);
  return (
    <div className="space-y-3">
      <StatusBadge kind="ticket" status={ticket.status} />
      <p>{ticket.description}</p>
      <ol className="space-y-1 text-sm text-text-muted">{ticket.history.map((h: any, i: number) => <li key={i}>{formatDate(h.at)}: {h.to ?? h.action}</li>)}</ol>
      <FormError error={rate.error ?? reopen.error} />
      {canRate && (
        <div className="flex gap-1" role="group" aria-label={t('Rate this')}>
          {[1, 2, 3, 4, 5].map((n) => <Button key={n} variant={ticket.rating === n ? 'primary' : 'secondary'} aria-label={t('{{n}} out of 5', { n })} onClick={() => rate.mutate({ rating: n })}>{n}</Button>)}
        </div>
      )}
      {ticket.status === 'resolved' && <Button variant="secondary" block loading={reopen.isPending} onClick={() => reopen.mutate({})}>{t('Reopen')}</Button>}
    </div>
  );
}

export function RequestsPage() {
  const { t } = useTranslation();
  const { workspace } = useAuth();
  const query = useGet<any[]>('/me/tickets', { retry: false });
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<any>(null);
  if (staySafe(query.error)) return <NoStay />;
  return (
    <div className="mx-auto max-w-[960px] text-base">
      <PageHeader title={t('Requests')} actions={<Button onClick={() => setAdding(true)}>{t('New request')}</Button>} />
      <Query query={query}>
        {(rows) =>
          rows.length === 0 ? <EmptyState title={t('No requests yet')} text={t('Tell us if something needs fixing.')} /> : (
            <ul className="space-y-2">
              {rows.map((ticket) => (
                <li key={ticket._id}>
                  <button type="button" onClick={() => setOpen(ticket)} className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface p-4 text-left">
                    <span className="min-w-0 truncate font-medium">{ticket.title}</span>
                    <StatusBadge kind="ticket" status={ticket.status} />
                  </button>
                </li>
              ))}
            </ul>
          )
        }
      </Query>
      {adding && <NewRequest open onClose={() => setAdding(false)} orgId={workspace?.orgId} />}
      <Sheet open={Boolean(open)} onClose={() => setOpen(null)} title={open?.title ?? ''}>{open && <RequestDetail ticket={open} />}</Sheet>
    </div>
  );
}

export function NoticesPage() {
  const { t } = useTranslation();
  const query = useGet<any[]>('/me/notices', { retry: false });
  if (staySafe(query.error)) return <NoStay />;
  return (
    <div className="mx-auto max-w-[960px] space-y-3 text-base">
      <PageHeader title={t('Notices')} />
      <Query query={query}>
        {(rows) => (rows.length === 0 ? <EmptyState title={t('No notices')} /> : <>{rows.map((n) => <Card key={n._id} className="rounded-lg"><h2 className="font-semibold">{n.title}</h2><p className="text-text-muted">{n.body}</p></Card>)}</>)}
      </Query>
    </div>
  );
}

export function MenuPage() {
  const { t } = useTranslation();
  const query = useGet<any>('/me/menu', { retry: false });
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  if (staySafe(query.error)) return <NoStay />;
  return (
    <div className="mx-auto max-w-[960px] space-y-3 text-base">
      <PageHeader title={t('Food menu')} />
      <Query query={query}>
        {(menu) =>
          !menu ? <EmptyState title={t('No menu posted.')} /> : (
            <div className="space-y-2">
              {menu.days.map((d: any) => (
                <Card key={d.day} className="rounded-lg">
                  <h2 className="font-semibold">{t(DAYS[d.day])}</h2>
                  <p className="text-sm text-text-muted">{[d.breakfast, d.lunch, d.snacks, d.dinner].filter(Boolean).join(' · ')}</p>
                </Card>
              ))}
            </div>
          )
        }
      </Query>
    </div>
  );
}

function KycForm({ profile, orgId }: { profile: any; orgId?: string }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    fullName: profile?.fullName ?? '',
    idType: profile?.idType ?? 'aadhaar',
    idNumber: '',
    idFrontKey: profile?.idFrontKey ?? '',
    idBackKey: profile?.idBackKey ?? '',
    permanentAddress: profile?.permanentAddress ?? '',
    contactName: profile?.emergencyContact?.name ?? '',
    relation: profile?.emergencyContact?.relation ?? '',
    contactPhone: (profile?.emergencyContact?.phone ?? '').replace(/^91/, ''),
  });
  const save = useSend('put', '/me/profile');
  const bind = (key: keyof typeof form) => ({ value: form[key], onChange: (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value }) });
  function submit(e: FormEvent) {
    e.preventDefault();
    const { contactName, relation, contactPhone, idBackKey, ...rest } = form;
    save.mutate({ ...rest, ...(idBackKey && { idBackKey }), emergencyContact: { name: contactName, relation, phone: contactPhone } });
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label={t('Full name')}><Input {...bind('fullName')} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('ID type')}>
          <Select {...bind('idType')}>
            <option value="aadhaar">Aadhaar</option><option value="pan">PAN</option><option value="passport">{t('Passport')}</option><option value="dl">{t('Driving licence')}</option><option value="voter">{t('Voter ID')}</option>
          </Select>
        </Field>
        <Field label={t('ID number')} hint={form.idType === 'aadhaar' ? t('We keep only the last 4 digits.') : t('Stored encrypted.')}><Input autoComplete="off" {...bind('idNumber')} /></Field>
      </div>
      {orgId && (
        <div className="grid gap-3 sm:grid-cols-2">
          <FileUpload label={t('ID front')} kind="kyc" orgId={orgId} value={form.idFrontKey} onChange={(idFrontKey) => setForm({ ...form, idFrontKey })} />
          <FileUpload label={t('ID back')} kind="kyc" orgId={orgId} value={form.idBackKey} onChange={(idBackKey) => setForm({ ...form, idBackKey })} />
        </div>
      )}
      <Field label={t('Permanent address')}><Textarea rows={2} {...bind('permanentAddress')} /></Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t('Emergency contact')}><Input {...bind('contactName')} /></Field>
        <Field label={t('Relation')}><Input {...bind('relation')} /></Field>
        <Field label={t('Their phone')}><Input inputMode="numeric" maxLength={10} {...bind('contactPhone')} /></Field>
      </div>
      <FormError error={save.error} />
      {save.isSuccess && <p className="text-success-text">{t('Sent for verification.')}</p>}
      <Button type="submit" loading={save.isPending} disabled={!form.idNumber || !form.idFrontKey}>{t('Submit for verification')}</Button>
    </form>
  );
}

function Agreement({ accepted }: { accepted: boolean }) {
  const { t } = useTranslation();
  const [otp, setOtp] = useState('');
  const send = useSend('post', '/me/agreement/otp');
  const accept = useSend('post', '/me/agreement/accept');
  if (accepted) return <p className="flex items-center gap-2 text-success-text"><CheckCircle2 className="size-4" aria-hidden /> {t('Agreement accepted.')}</p>;
  return (
    <div className="space-y-3">
      <p className="text-text-muted">{t('Accept the house rules and rent terms with an OTP.')}</p>
      <FormError error={send.error ?? accept.error} />
      {send.isSuccess ? (
        <div className="flex gap-2">
          <Input aria-label={t('6-digit code')} inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value)} />
          <Button loading={accept.isPending} disabled={otp.length !== 6} onClick={() => accept.mutate({ otp })}>{t('Accept')}</Button>
        </div>
      ) : <Button variant="secondary" loading={send.isPending} onClick={() => send.mutate({})}>{t('Get OTP')}</Button>}
    </div>
  );
}

export function ProfilePage() {
  const { t } = useTranslation();
  const { workspace } = useAuth();
  const profile = useGet<any>('/me/profile', { retry: false });
  const home = useGet<any>('/me/home', { retry: false });
  const [leaving, setLeaving] = useState(false);
  const [exit, setExit] = useState(todayInput());
  const notice = useSend('post', '/me/notice-to-vacate');
  if (staySafe(profile.error)) return <NoStay />;
  if (profile.isError) return <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />;
  const stay = home.data?.stay;
  return (
    <div className="mx-auto max-w-[960px] space-y-4 text-base">
      <PageHeader title={t('Profile')} />
      {profile.data && (
        <>
          <Card className="rounded-lg">
            <CardTitle action={<StatusBadge kind="kyc" status={profile.data.kycStatus} />}>{t('My details and KYC')}</CardTitle>
            <KycForm profile={profile.data} orgId={workspace?.orgId} />
          </Card>
          <Card className="rounded-lg"><CardTitle>{t('Agreement')}</CardTitle><Agreement accepted={Boolean(stay?.agreement?.acceptedAt)} /></Card>
          {stay?.status === 'active' && (
            <Card className="rounded-lg">
              <CardTitle>{t('Leaving?')}</CardTitle>
              <Field label={t('Expected exit date')}><Input type="date" value={exit} onChange={(e) => setExit(e.target.value)} /></Field>
              <Button variant="secondary" className="mt-3" onClick={() => setLeaving(true)}>{t('Give notice to vacate')}</Button>
            </Card>
          )}
        </>
      )}
      <Confirm open={leaving} onClose={() => setLeaving(false)} title={t('Give notice to vacate')} text={t('Your PG will be told you are leaving on {{date}}.', { date: formatDate(exit) })} action={t('Give notice')} loading={notice.isPending} error={notice.error} onConfirm={() => notice.mutate({ expectedExitDate: exit }, { onSuccess: () => setLeaving(false) })} />
    </div>
  );
}
