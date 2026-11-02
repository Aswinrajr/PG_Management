import { EXPENSE_CATEGORIES } from '@roomora/types';
import { Pin } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Button, Card, CardTitle, DataList, EmptyState, Field, FileUpload, FormError, Input, Money, PageHeader, Pagination, Query, Select, Sheet, StatusBadge, Tabs, Textarea } from '../../components/ui';
import { useGet, useGetPage, useSend } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDate, formatINR, rupeesToPaise, todayInput, weekStartOf } from '../../lib/format';
import { useProperties, usePropertyFilter } from '../../lib/property';

const CHART = ['var(--color-primary)', 'var(--color-secondary)', 'var(--color-accent)', '#EC4899', '#0EA5E9', '#84CC16', '#94A3B8', '#475569'];

function ExpenseSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { orgPath, workspace } = useAuth();
  const properties = useProperties();
  const { propertyId } = usePropertyFilter();
  const [form, setForm] = useState({ propertyId, category: 'groceries', amount: '', date: todayInput(), description: '', paidVia: 'cash', billKey: '' });
  const save = useSend('post', orgPath('/expenses'));
  const bind = (key: keyof typeof form) => ({ value: form[key], onChange: (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value }) });
  const target = form.propertyId || properties.data?.[0]?._id || '';

  function submit(e: FormEvent) {
    e.preventDefault();
    const { amount, billKey, ...rest } = form;
    save.mutate({ ...rest, propertyId: target, amountPaise: rupeesToPaise(amount), date: new Date(form.date), ...(billKey && { billKey }) }, { onSuccess: onClose });
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('Add expense')}>
      <form onSubmit={submit} className="space-y-3">
        <Field label={t('PG')}><Select value={target} onChange={bind('propertyId').onChange}>{properties.data?.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}</Select></Field>
        <Field label={t('Category')}><Select {...bind('category')}>{EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{t(c)}</option>)}</Select></Field>
        <Field label={t('Amount (₹)')}><Input inputMode="decimal" {...bind('amount')} /></Field>
        <Field label={t('Date')}><Input type="date" {...bind('date')} /></Field>
        <Field label={t('Description')}><Input {...bind('description')} /></Field>
        <FileUpload label={t('Bill photo')} kind="bill" orgId={workspace!.orgId} value={form.billKey} onChange={(billKey) => setForm({ ...form, billKey })} />
        <FormError error={save.error} />
        <Button type="submit" block disabled={!Number(form.amount)} loading={save.isPending}>{t('Save')}</Button>
      </form>
    </Sheet>
  );
}

export function ExpensesPage() {
  const { t } = useTranslation();
  const { orgPath } = useAuth();
  const { query: filter } = usePropertyFilter();
  const [month, setMonth] = useState(todayInput().slice(0, 7));
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [year, mon] = month.split('-').map(Number);
  const range = `from=${month}-01&to=${new Date(Date.UTC(year, mon, 0)).toISOString().slice(0, 10)}`;
  const query = useGetPage<any>(orgPath(`/expenses?page=${page}&${range}&${filter}`));
  const report = useGet<{ byCategory: Record<string, number>; totalPaise: number }>(orgPath(`/reports/expenses?${range}&${filter}`));
  const slices = Object.entries(report.data?.byCategory ?? {}).map(([name, value]) => ({ name, value: value / 100 }));
  return (
    <>
      <PageHeader title={t('Expenses')} actions={<Button onClick={() => setAdding(true)}>{t('Add expense')}</Button>} />
      <Input aria-label={t('Month')} type="month" className="mb-4 w-auto" value={month} onChange={(e) => { setMonth(e.target.value); setPage(1); }} />
      {slices.length > 0 && (
        <Card className="mb-4">
          <CardTitle>{t('Total {{amount}}', { amount: formatINR(report.data!.totalPaise) })}</CardTitle>
          <div className="grid items-center gap-4 sm:grid-cols-2">
            <div className="h-48" role="img" aria-label={t('Expenses by category')}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={slices} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
                    {slices.map((s, i) => <Cell key={s.name} fill={CHART[i % CHART.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => `₹${Number(v).toLocaleString('en-IN')}`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="space-y-1">
              {slices.map((s, i) => (
                <li key={s.name} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2"><span className="size-3 rounded-sm" style={{ background: CHART[i % CHART.length] }} aria-hidden /> {t(s.name)}</span>
                  <span className="tabular">₹{s.value.toLocaleString('en-IN')}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}
      <Query query={query}>
        {({ items, meta }) =>
          items.length === 0 ? <EmptyState title={t('No expenses this month')} action={<Button onClick={() => setAdding(true)}>{t('Add expense')}</Button>} /> : (
            <>
              <DataList
                rows={items}
                rowKey={(e) => e._id}
                columns={[
                  { header: t('Date'), cell: (e) => formatDate(e.date) },
                  { header: t('Category'), cell: (e) => t(e.category) },
                  { header: t('Description'), cell: (e) => e.description },
                  { header: t('Amount'), align: 'right', cell: (e) => <Money paise={e.amountPaise} /> },
                ]}
                mobile={(e) => <div className="flex justify-between gap-2"><span>{t(e.category)}</span><Money paise={e.amountPaise} /></div>}
              />
              <Pagination page={meta.page} totalPages={meta.totalPages} onChange={setPage} />
            </>
          )
        }
      </Query>
      {adding && <ExpenseSheet open onClose={() => setAdding(false)} />}
    </>
  );
}

const COLUMNS = ['open', 'in_progress', 'resolved', 'closed'] as const;

function TicketDrawer({ ticket, onClose }: { ticket: any; onClose: () => void }) {
  const { t } = useTranslation();
  const { orgPath } = useAuth();
  const update = useSend('patch', orgPath(`/tickets/${ticket._id}`));
  const [note, setNote] = useState('');
  const NEXT: Record<string, string[]> = { open: ['in_progress', 'resolved', 'rejected'], in_progress: ['resolved', 'open'], resolved: ['closed', 'open'], closed: [], rejected: [] };
  return (
    <div className="space-y-3">
      <StatusBadge kind="ticket" status={ticket.status} />
      <p>{ticket.description}</p>
      <p className="text-xs capitalize text-text-muted">{t(ticket.category)} · {t(ticket.priority)} · {formatDate(ticket.createdAt)}</p>
      <Field label={t('Note')}><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <FormError error={update.error} />
      <div className="flex flex-wrap gap-2">
        {NEXT[ticket.status].map((status) => <Button key={status} variant="secondary" onClick={() => update.mutate({ status, note: note || undefined }, { onSuccess: onClose })}>{t(`Move to ${status.replace('_', ' ')}`)}</Button>)}
      </div>
      <ol className="space-y-1 border-t border-border pt-2 text-xs text-text-muted">
        {ticket.history.map((h: any, i: number) => <li key={i}>{formatDate(h.at)}: {h.action}{h.to ? ` → ${h.to}` : ''}{h.note ? ` (${h.note})` : ''}</li>)}
      </ol>
    </div>
  );
}

export function ComplaintsPage() {
  const { t } = useTranslation();
  const { orgPath } = useAuth();
  const { query: filter } = usePropertyFilter();
  const [tab, setTab] = useState<(typeof COLUMNS)[number]>('open');
  const [open, setOpen] = useState<any>(null);
  const query = useGetPage<any>(orgPath(`/tickets?limit=100&${filter}`));
  const card = (ticket: any) => (
    <button key={ticket._id} type="button" onClick={() => setOpen(ticket)} className="block w-full rounded-md border border-border bg-surface p-3 text-left shadow-card hover:border-primary">
      <p className="text-xs text-text-muted">{ticket.number}</p>
      <p className="font-medium">{ticket.title}</p>
      <p className="text-xs capitalize text-text-muted">{t(ticket.priority)} · {formatDate(ticket.createdAt)}</p>
    </button>
  );
  const LABEL = { open: t('Open'), in_progress: t('In progress'), resolved: t('Resolved'), closed: t('Closed') };
  return (
    <>
      <PageHeader title={t('Complaints')} />
      <Query query={query}>
        {({ items }) => (
          <>
            <div className="md:hidden">
              <Tabs value={tab} onChange={setTab} tabs={COLUMNS.map((value) => ({ value, label: LABEL[value] }))} />
              <div className="space-y-2">{items.filter((i) => i.status === tab).map(card)}</div>
              {!items.some((i) => i.status === tab) && <EmptyState title={t('Nothing here')} />}
            </div>
            <div className="hidden gap-4 md:grid md:grid-cols-4">
              {COLUMNS.map((column) => (
                <section key={column} aria-label={LABEL[column]} className="rounded-md bg-surface-muted p-2">
                  <h2 className="mb-2 px-1 font-semibold">{LABEL[column]} ({items.filter((i) => i.status === column).length})</h2>
                  <div className="space-y-2">{items.filter((i) => i.status === column).map(card)}</div>
                </section>
              ))}
            </div>
          </>
        )}
      </Query>
      <Sheet open={Boolean(open)} onClose={() => setOpen(null)} title={open?.title ?? ''}>
        {open && <TicketDrawer ticket={open} onClose={() => setOpen(null)} />}
      </Sheet>
    </>
  );
}

export function NoticesPage() {
  const { t } = useTranslation();
  const { orgPath } = useAuth();
  const query = useGet<any[]>(orgPath('/notices'));
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', pinned: false });
  const save = useSend('post', orgPath('/notices'));
  return (
    <>
      <PageHeader title={t('Notices')} actions={<Button onClick={() => setAdding(true)}>{t('Post notice')}</Button>} />
      <Query query={query}>
        {(items) =>
          items.length === 0 ? <EmptyState title={t('No notices yet')} action={<Button onClick={() => setAdding(true)}>{t('Post notice')}</Button>} /> : (
            <div className="grid gap-4 md:grid-cols-2">
              {items.map((notice) => (
                <Card key={notice._id}>
                  <h2 className="flex items-center gap-2 font-semibold">{notice.pinned && <Pin className="size-4 text-primary" aria-label={t('Pinned')} />} {notice.title}</h2>
                  <p className="mt-1 whitespace-pre-line text-text-muted">{notice.body}</p>
                  <p className="mt-2 text-xs text-text-muted">{formatDate(notice.publishedAt)}</p>
                </Card>
              ))}
            </div>
          )
        }
      </Query>
      <Sheet open={adding} onClose={() => setAdding(false)} title={t('Post notice')}>
        <div className="space-y-3">
          <Field label={t('Title')}><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label={t('Message')}><Textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></Field>
          <label className="flex min-h-11 items-center gap-2"><input type="checkbox" className="size-5" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} /> {t('Pin to top')}</label>
          <FormError error={save.error} />
          <Button block loading={save.isPending} onClick={() => save.mutate(form, { onSuccess: () => { setAdding(false); setForm({ title: '', body: '', pinned: false }); } })}>{t('Post notice')}</Button>
        </div>
      </Sheet>
    </>
  );
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MEALS = ['breakfast', 'lunch', 'snacks', 'dinner'] as const;
const emptyWeek = () => DAYS.map((_, day) => ({ day, breakfast: '', lunch: '', snacks: '', dinner: '' }));

function MenuEditor({ propertyId, weekStart, initial, previous }: { propertyId: string; weekStart: string; initial: any[]; previous?: any[] }) {
  const { t } = useTranslation();
  const { orgPath } = useAuth();
  const [days, setDays] = useState(initial);
  const [day, setDay] = useState('0');
  const save = useSend('put', orgPath(`/properties/${propertyId}/menus/${weekStart}`));
  const set = (i: number, meal: string, value: string) => setDays(days.map((d, n) => (n === i ? { ...d, [meal]: value } : d)));
  return (
    <>
      <div className="md:hidden">
        <Tabs value={day} onChange={setDay} tabs={DAYS.map((label, i) => ({ value: String(i), label: t(label) }))} />
        <div className="space-y-3">
          {MEALS.map((meal) => <Field key={meal} label={t(meal)}><Input value={days[Number(day)][meal]} onChange={(e) => set(Number(day), meal, e.target.value)} /></Field>)}
        </div>
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead><tr><th scope="col" />{MEALS.map((m) => <th key={m} scope="col" className="px-1 py-2 text-left font-medium capitalize text-text-muted">{t(m)}</th>)}</tr></thead>
          <tbody>
            {days.map((d, i) => (
              <tr key={d.day}>
                <th scope="row" className="pr-2 text-left font-medium">{t(DAYS[i])}</th>
                {MEALS.map((meal) => <td key={meal} className="p-1"><Input aria-label={`${t(DAYS[i])} ${t(meal)}`} value={d[meal]} onChange={(e) => set(i, meal, e.target.value)} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <FormError error={save.error} />
      {save.isSuccess && <p className="text-success-text">{t('Saved.')}</p>}
      <div className="mt-3 flex gap-2">
        <Button loading={save.isPending} onClick={() => save.mutate({ days })}>{t('Save')}</Button>
        {previous && <Button variant="secondary" onClick={() => setDays(previous)}>{t('Copy last week')}</Button>}
      </div>
    </>
  );
}

export function FoodMenuPage() {
  const { t } = useTranslation();
  const { orgPath } = useAuth();
  const properties = useProperties();
  const { propertyId } = usePropertyFilter();
  const active = propertyId || properties.data?.[0]?._id || '';
  const [week, setWeek] = useState(0);
  const weekStart = weekStartOf(week);
  const query = useGet<any>(active ? orgPath(`/properties/${active}/menus/${weekStart}`) : null);
  const last = useGet<any>(active ? orgPath(`/properties/${active}/menus/${weekStartOf(week - 1)}`) : null);
  return (
    <>
      <PageHeader title={t('Food menu')} subtitle={t('Week of {{date}}', { date: formatDate(weekStart) })} actions={<><Button variant="secondary" onClick={() => setWeek(week - 1)}>{t('Previous')}</Button><Button variant="secondary" onClick={() => setWeek(week + 1)}>{t('Next')}</Button></>} />
      <Card>
        {query.isPending ? <p className="text-text-muted">{t('Loading…')}</p> : <MenuEditor key={`${active}${weekStart}`} propertyId={active} weekStart={weekStart} initial={query.data?.days ?? emptyWeek()} previous={last.data?.days} />}
      </Card>
    </>
  );
}

const REPORTS = [
  { type: 'collections', label: 'Collections', financial: false },
  { type: 'dues', label: 'Dues', financial: false },
  { type: 'occupancy', label: 'Occupancy', financial: false },
  { type: 'expenses', label: 'Expenses', financial: false },
  { type: 'pnl', label: 'Profit and loss', financial: true },
  { type: 'gst-summary', label: 'GST summary', financial: true },
];

function toCsv(rows: any[]) {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]).filter((k) => typeof rows[0][k] !== 'object');
  return [keys.join(','), ...rows.map((r) => keys.map((k) => JSON.stringify(r[k] ?? '')).join(','))].join('\n');
}

export function ReportsPage() {
  const { t } = useTranslation();
  const { orgPath } = useAuth();
  const { query: filter } = usePropertyFilter();
  const [type, setType] = useState('collections');
  const [from, setFrom] = useState(`${todayInput().slice(0, 4)}-01-01`);
  const [to, setTo] = useState(todayInput());
  const query = useGet<any>(orgPath(`/reports/${type}?from=${from}&to=${to}&${filter}`), { retry: false });
  const totals = Object.entries(query.data ?? {}).filter(([, v]) => typeof v === 'number') as [string, number][];
  const rows: any[] = query.data?.rows ?? [];
  const download = () => {
    const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${type}-${from}-${to}.csv`;
    link.click();
  };
  return (
    <>
      <PageHeader title={t('Reports')} actions={<Button variant="secondary" disabled={!rows.length} onClick={download}>{t('Export CSV')}</Button>} />
      <div className="mb-4 grid grid-cols-2 gap-2 md:flex">
        <Select aria-label={t('Report')} className="col-span-2 md:w-56" value={type} onChange={(e) => setType(e.target.value)}>
          {REPORTS.map((r) => <option key={r.type} value={r.type}>{t(r.label)}</option>)}
        </Select>
        <Input aria-label={t('From')} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input aria-label={t('To')} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <Query query={query}>
        {() => (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {totals.map(([key, value]) => (
                <Card key={key}>
                  <p className="text-xs text-text-muted">{t(key.replace('Paise', '').replace(/([A-Z])/g, ' $1').toLowerCase())}</p>
                  <p className="tabular text-xl font-bold">{key.endsWith('Paise') ? formatINR(value) : value}</p>
                </Card>
              ))}
            </div>
            {rows.length > 0 && <p className="text-text-muted">{t('{{count}} records in this report.', { count: rows.length })}</p>}
          </div>
        )}
      </Query>
    </>
  );
}

function KycCard({ org }: { org: any }) {
  const { t } = useTranslation();
  return <Card><CardTitle action={<StatusBadge kind="kyc" status={org.kyc?.status} />}>{t('PG documents')}</CardTitle><p className="text-text-muted">{t('Reviewed by the Roomora team.')}</p></Card>;
}

function PaymentsCard({ org }: { org: any }) {
  const { t } = useTranslation();
  const { orgPath } = useAuth();
  const [form, setForm] = useState({ keyId: '', keySecret: '', webhookSecret: '' });
  const save = useSend('put', orgPath('/razorpay'));
  const webhook = `${new URL(import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1', window.location.href).href}/webhooks/razorpay/${org._id}`;
  return (
    <Card>
      <CardTitle>{t('Online payments')}</CardTitle>
      <p className="mb-3 text-text-muted">{org.razorpayConnected ? t('Connected: {{key}}. Rent goes straight to your Razorpay account.', { key: org.razorpayKeyId }) : t('Connect your own Razorpay account. Rent goes straight to you.')}</p>
      <div className="space-y-3">
        <Field label={t('Key ID')}><Input autoComplete="off" value={form.keyId} onChange={(e) => setForm({ ...form, keyId: e.target.value })} /></Field>
        <Field label={t('Key secret')}><Input type="password" autoComplete="off" value={form.keySecret} onChange={(e) => setForm({ ...form, keySecret: e.target.value })} /></Field>
        <Field label={t('Webhook secret')} hint={webhook}><Input type="password" autoComplete="off" value={form.webhookSecret} onChange={(e) => setForm({ ...form, webhookSecret: e.target.value })} /></Field>
        <FormError error={save.error} />
        <Button loading={save.isPending} disabled={!form.keyId || !form.keySecret || !form.webhookSecret} onClick={() => save.mutate(form)}>{t('Save')}</Button>
      </div>
    </Card>
  );
}

function GstCard({ org }: { org: any }) {
  const { t } = useTranslation();
  const { orgPath } = useAuth();
  const [form, setForm] = useState({ gstEnabled: Boolean(org.gstEnabled), gstin: org.gstin ?? '', legalName: org.legalName ?? '', rate: String(org.settings?.gstRatePct ?? 12), exemption: org.settings?.gstHostelExemption ?? true });
  const save = useSend('patch', orgPath(''));
  return (
    <Card>
      <CardTitle>{t('GST')}</CardTitle>
      <div className="space-y-3">
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" className="size-5" checked={form.gstEnabled} onChange={(e) => setForm({ ...form, gstEnabled: e.target.checked })} /> {t('Charge GST on invoices')}</label>
        <Field label={t('GSTIN')}><Input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })} /></Field>
        <Field label={t('Legal name')}><Input value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} /></Field>
        <Field label={t('GST rate (%)')} hint={t('Confirm the rate with your CA.')}><Input inputMode="decimal" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} /></Field>
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" className="size-5" checked={form.exemption} onChange={(e) => setForm({ ...form, exemption: e.target.checked })} /> {t('Rent up to ₹20,000 per person is exempt')}</label>
        <FormError error={save.error} />
        <Button loading={save.isPending} onClick={() => save.mutate({ gstEnabled: form.gstEnabled, ...(form.gstin && { gstin: form.gstin }), legalName: form.legalName, settings: { gstRatePct: Number(form.rate), gstHostelExemption: form.exemption } })}>{t('Save')}</Button>
      </div>
    </Card>
  );
}

export function SettingsPage() {
  const { t } = useTranslation();
  const { orgPath } = useAuth();
  const query = useGet<any>(orgPath(''));
  return (
    <>
      <PageHeader title={t('Settings')} />
      <Query query={query}>
        {(org) => (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardTitle action={<StatusBadge kind="org" status={org.status} />}>{org.name}</CardTitle>
              <p className="text-text-muted">{org.city}, {org.state}</p>
              {org.status === 'trial' && <p className="mt-2">{t('Trial ends {{date}}', { date: formatDate(org.trialEndsAt) })}</p>}
            </Card>
            <KycCard org={org} />
            <PaymentsCard org={org} />
            <GstCard org={org} />
          </div>
        )}
      </Query>
    </>
  );
}

