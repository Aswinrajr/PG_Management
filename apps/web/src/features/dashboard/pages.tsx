import { BedDouble, CircleDollarSign, Clock, Plus, ReceiptIndianRupee, UserPlus, Wallet, Megaphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button, Card, CardTitle, EmptyState, Money, Query, Skeleton, StatCard, StatusBadge } from '../../components/ui';
import { useGet, useSend } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDate, formatINR, formatPeriod } from '../../lib/format';
import { usePropertyFilter } from '../../lib/property';

interface Dashboard {
  occupancyPct: number;
  beds: { total: number; vacant: number; occupied: number; notice: number; reserved: number; maintenance: number };
  month: { expectedPaise: number; collectedPaise: number; pendingPaise: number; expensesPaise?: number; netPaise?: number };
  collectionTrend: { period: string; collectedPaise: number; expectedPaise: number }[];
  dueThisWeek: { _id: string; number: string; balancePaise: number; dueDate: string; status: string }[];
  openTickets: { _id: string; number: string; title: string; status: string; priority: string }[];
  upcoming: { checkIns: { _id: string; joinDate: string }[]; checkOuts: { _id: string; expectedExitDate: string }[] };
}

function Checklist() {
  const { t } = useTranslation();
  const { orgPath } = useAuth();
  const query = useGet<{ steps: { key: string; done: boolean }[] }>(orgPath('/onboarding'));
  const LABELS: Record<string, [string, string]> = {
    property: [t('Add your PG'), '/app/properties'],
    rooms: [t('Add rooms and beds'), '/app/properties'],
    kyc: [t('Submit PG documents'), '/app/settings'],
    payments: [t('Connect online payments'), '/app/settings'],
    resident: [t('Add your first resident'), '/app/residents/new'],
  };
  const steps = query.data?.steps;
  if (!steps || steps.every((s) => s.done)) return null;
  return (
    <Card>
      <CardTitle>{t('Setup checklist')}</CardTitle>
      <ul className="space-y-1">
        {steps.map((step) => (
          <li key={step.key}>
            <Link to={LABELS[step.key][1]} className="flex min-h-11 items-center gap-2">
              <span aria-hidden>{step.done ? '✓' : '○'}</span>
              <span className={step.done ? 'text-text-muted line-through' : ''}>{LABELS[step.key][0]}</span>
              {step.done && <span className="sr-only">{t('Done')}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Gradient banner with a greeting and an occupancy ring that fills on load. */
function Welcome({ occupancyPct, vacant }: { occupancyPct?: number; vacant?: number }) {
  const { t } = useTranslation();
  const { me, workspace } = useAuth();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? t('Good morning') : hour < 17 ? t('Good afternoon') : t('Good evening');
  const first = me?.user.name?.split(' ')[0];
  const pct = occupancyPct ?? 0;
  const r = 34;
  const length = 2 * Math.PI * r;
  return (
    <section className="aurora relative mb-4 overflow-hidden rounded-2xl p-5 text-white shadow-overlay md:mb-6 md:p-7">
      <div className="blob -right-10 -top-16 size-56 bg-teal-300/30" aria-hidden />
      <div className="relative flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-white/75">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1 className="mt-1 font-brand text-2xl font-bold tracking-tight md:text-3xl">{greeting}{first ? `, ${first}` : ''} 👋</h1>
          <p className="mt-1 truncate text-white/80">
            {workspace?.orgName}
            {vacant !== undefined && <> · {vacant === 0 ? t('Fully occupied') : t('{{count}} beds free', { count: vacant })}</>}
          </p>
        </div>
        <div className="relative hidden size-24 shrink-0 sm:block" role="img" aria-label={t('{{pct}}% occupied', { pct })}>
          <svg viewBox="0 0 80 80" className="size-full -rotate-90">
            <circle cx="40" cy="40" r={r} fill="none" stroke="rgb(255 255 255 / 0.2)" strokeWidth="8" />
            <circle cx="40" cy="40" r={r} fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" strokeDasharray={length} strokeDashoffset={length * (1 - pct / 100)} className="transition-[stroke-dashoffset] duration-1000 ease-out" />
          </svg>
          <span className="absolute inset-0 flex flex-col items-center justify-center leading-tight">
            <span className="tabular text-xl font-bold">{pct}%</span>
            <span className="text-[10px] uppercase tracking-wider text-white/75">{t('Occupied')}</span>
          </span>
        </div>
      </div>
    </section>
  );
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const { orgPath } = useAuth();
  const { query: filter } = usePropertyFilter();
  const query = useGet<Dashboard>(orgPath(`/dashboard?${filter}`));
  const remind = useSend<string>('post', (id) => orgPath(`/invoices/${id}/remind`));

  const actions = [
    { to: '/app/residents/new', label: t('Add resident'), icon: UserPlus },
    { to: '/app/billing/dues', label: t('Record payment'), icon: Wallet },
    { to: '/app/expenses', label: t('Add expense'), icon: Plus },
    { to: '/app/notices', label: t('Post notice'), icon: Megaphone },
  ];

  return (
    <>
      <Welcome occupancyPct={query.data?.occupancyPct} vacant={query.data?.beds.vacant} />
      <Query
        query={query}
        skeleton={<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>}
      >
        {(data) => (
          <div className="stagger space-y-4 md:space-y-6">
            <div className="stagger grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
              <StatCard icon={BedDouble} label={t('Occupancy')} value={`${data.occupancyPct}%`} hint={t('{{used}} of {{total}} beds', { used: data.beds.occupied + data.beds.notice, total: data.beds.total })} to="/app/bedmap" />
              <StatCard icon={BedDouble} label={t('Vacant beds')} value={data.beds.vacant} to="/app/bedmap" />
              <StatCard icon={CircleDollarSign} label={t('Collected this month')} value={formatINR(data.month.collectedPaise)} hint={t('of {{amount}}', { amount: formatINR(data.month.expectedPaise) })} to="/app/billing/payments" />
              <StatCard icon={ReceiptIndianRupee} label={t('Pending dues')} value={formatINR(data.month.pendingPaise)} to="/app/billing/dues" />
            </div>

            <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardTitle>{t('Collections, last 6 months')}</CardTitle>
                <div className="h-64" role="img" aria-label={t('Bars show rent collected, the line shows rent expected')}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data.collectionTrend.map((r) => ({ ...r, month: formatPeriod(r.period), collected: r.collectedPaise / 100, expected: r.expectedPaise / 100 }))}>
                      <CartesianGrid vertical={false} stroke="var(--color-border)" />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} />
                      <YAxis width={56} tickFormatter={(v: number) => `₹${Math.round(v / 1000)}k`} tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} />
                      <Tooltip formatter={(v) => `₹${Number(v).toLocaleString('en-IN')}`} />
                      <Bar animationDuration={700} dataKey="collected" name={t('Collected')} fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                      <Line animationDuration={700} dataKey="expected" name={t('Expected')} stroke="var(--color-secondary)" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <div className="space-y-4 md:space-y-6">
                <Card>
                  <CardTitle>{t('Quick actions')}</CardTitle>
                  <div className="grid grid-cols-2 gap-2">
                    {actions.map(({ to, label, icon: Icon }) => (
                      <Link key={to} to={to} className="group flex min-h-11 items-center gap-2 rounded-lg border border-border p-2 text-sm font-medium transition hover:-translate-y-0.5 hover:border-primary hover:bg-primary-soft">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary transition group-hover:bg-primary group-hover:text-white"><Icon className="size-4" aria-hidden /></span> {label}
                      </Link>
                    ))}
                  </div>
                </Card>
                <Checklist />
              </div>
            </div>

            <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
              <Card>
                <CardTitle>{t('Rent due this week')}</CardTitle>
                {data.dueThisWeek.length === 0 ? <p className="text-text-muted">{t('Nothing due this week.')}</p> : (
                  <ul className="space-y-2">
                    {data.dueThisWeek.map((invoice) => (
                      <li key={invoice._id} className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{invoice.number}</p>
                          <p className="text-xs text-text-muted"><Clock className="inline size-3" aria-hidden /> {formatDate(invoice.dueDate)}</p>
                        </div>
                        <Money paise={invoice.balancePaise} className="font-semibold" />
                        <Button variant="secondary" loading={remind.isPending && remind.variables === invoice._id} onClick={() => remind.mutate(invoice._id)}>{t('Remind')}</Button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card>
                <CardTitle>{t('Open complaints')}</CardTitle>
                {data.openTickets.length === 0 ? <p className="text-text-muted">{t('No open complaints.')}</p> : (
                  <ul className="space-y-2">
                    {data.openTickets.map((ticket) => (
                      <li key={ticket._id} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate">{ticket.title}</span>
                        <StatusBadge kind="ticket" status={ticket.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card>
                <CardTitle>{t('Coming up')}</CardTitle>
                {data.upcoming.checkIns.length + data.upcoming.checkOuts.length === 0 ? <EmptyState title={t('Nothing in the next 7 days')} /> : (
                  <ul className="space-y-2">
                    {data.upcoming.checkIns.map((stay) => <li key={stay._id} className="flex justify-between gap-2"><span>{t('Check-in')}</span><span className="text-text-muted">{formatDate(stay.joinDate)}</span></li>)}
                    {data.upcoming.checkOuts.map((stay) => <li key={stay._id} className="flex justify-between gap-2"><span>{t('Check-out')}</span><span className="text-text-muted">{formatDate(stay.expectedExitDate)}</span></li>)}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        )}
      </Query>
    </>
  );
}
