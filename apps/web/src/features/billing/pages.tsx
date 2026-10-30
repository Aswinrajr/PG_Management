import { useQueryClient } from '@tanstack/react-query';
import { Clock, MessageCircle } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, CardTitle, Confirm, DataList, EmptyState, Field, FormError, Input, Money, PageHeader, Pagination, Query, Select, Sheet, StatCard, StatusBadge } from '../../components/ui';
import { api, useGet, useGetPage, useSend } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { currentPeriod, formatDate, formatINR, formatPeriod, rupeesToPaise, todayInput } from '../../lib/format';
import { useProperties, usePropertyFilter } from '../../lib/property';

async function openPdf(path: string) {
  const blob = await api.blob(path);
  window.open(URL.createObjectURL(blob), '_blank');
}

export function RecordPaymentSheet({ open, onClose, stayId, defaultPaise }: { open: boolean; onClose: () => void; stayId: string; defaultPaise?: number }) {
  const { t } = useTranslation();
  const { orgPath } = useAuth();
  const [amount, setAmount] = useState(defaultPaise ? String(defaultPaise / 100) : '');
  const [mode, setMode] = useState('upi');
  const [reference, setReference] = useState('');
  const [date, setDate] = useState(todayInput());
  const [key] = useState(() => crypto.randomUUID()); // a double tap must not record twice
  const [receipt, setReceipt] = useState<{ _id: string; receiptNumber: string; amountPaise: number } | null>(null);
  const client = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      setReceipt(await api.post<any>(orgPath('/payments'), { stayId, amountPaise: rupeesToPaise(amount), mode, reference: reference || undefined, paidAt: new Date(date) }, { 'Idempotency-Key': key }));
      await client.invalidateQueries();
    } catch (err) {
      setError(err as Error);
    } finally {
      setSaving(false);
    }
  }

  const close = () => {
    setReceipt(null);
    onClose();
  };

  return (
    <Sheet open={open} onClose={close} title={t('Record payment')}>
      {receipt ? (
        <div className="space-y-3 text-center">
          <p className="text-lg font-semibold">{t('Payment saved')}</p>
          <p>{receipt.receiptNumber} · <Money paise={receipt.amountPaise} /></p>
          <Button variant="secondary" block onClick={() => void openPdf(orgPath(`/payments/${receipt._id}/receipt`))}>{t('Open receipt')}</Button>
          <a href={`https://wa.me/?text=${encodeURIComponent(t('Receipt {{number}} for {{amount}}. Thank you.', { number: receipt.receiptNumber, amount: formatINR(receipt.amountPaise) }))}`} target="_blank" rel="noreferrer" className="block">
            <Button block><MessageCircle className="size-4" aria-hidden /> {t('Share on WhatsApp')}</Button>
          </a>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <Field label={t('Amount (₹)')}><Input inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label={t('Mode')}>
            <Select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="upi">UPI</option><option value="cash">{t('Cash')}</option><option value="bank">{t('Bank')}</option><option value="card">{t('Card')}</option>
            </Select>
          </Field>
          <Field label={t('Reference (optional)')}><Input value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
          <Field label={t('Date')}><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <FormError error={error} />
          <Button type="submit" block loading={saving} disabled={!Number(amount)}>{t('Save')}</Button>
        </form>
      )}
    </Sheet>
  );
}

interface DueRow {
  _id: string;
  number: string;
  stayId: string;
  balancePaise: number;
  dueDate: string;
  status: string;
  daysLate: number;
  period?: string;
}

export function DuesPage() {
  const { t } = useTranslation();
  const { orgPath } = useAuth();
  const query = useGet<{ buckets: Record<string, number>; totalPaise: number; items: DueRow[] }>(orgPath('/dues'));
  const remind = useSend<string>('post', (id) => orgPath(`/invoices/${id}/remind`));
  const [paying, setPaying] = useState<DueRow | null>(null);
  return (
    <>
      <PageHeader title={t('Dues')} />
      <Query query={query}>
        {(data) => (
          <>
            <div className="mb-4 grid grid-cols-3 gap-3">
              <StatCard icon={Clock} label={t('0–7 days')} value={formatINR(data.buckets['0-7'])} />
              <StatCard icon={Clock} label={t('8–30 days')} value={formatINR(data.buckets['8-30'])} />
              <StatCard icon={Clock} label={t('30+ days')} value={formatINR(data.buckets['30+'])} />
            </div>
            {data.items.length === 0 ? <EmptyState title={t('No dues')} text={t('Everyone has paid.')} /> : (
              <DataList
                rows={data.items}
                rowKey={(r) => r._id}
                columns={[
                  { header: t('Invoice'), cell: (r) => r.number },
                  { header: t('Due'), cell: (r) => formatDate(r.dueDate) },
                  { header: t('Late by'), cell: (r) => t('{{days}} days', { days: r.daysLate }) },
                  { header: t('Balance'), align: 'right', cell: (r) => <Money paise={r.balancePaise} /> },
                  { header: t('Status'), cell: (r) => <StatusBadge kind="invoice" status={r.status} /> },
                  {
                    header: t('Actions'),
                    cell: (r) => (
                      <div className="flex gap-2">
                        <Button variant="secondary" onClick={() => remind.mutate(r._id)}>{t('Remind')}</Button>
                        <Button onClick={() => setPaying(r)}>{t('Record payment')}</Button>
                      </div>
                    ),
                  },
                ]}
                onRow={undefined}
                mobile={(r) => (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2"><span className="truncate font-medium">{r.number}</span><Money paise={r.balancePaise} /></div>
                    <div className="flex items-center justify-between gap-2"><span className="text-xs text-text-muted">{formatDate(r.dueDate)}</span><StatusBadge kind="invoice" status={r.status} /></div>
                    <span role="link" tabIndex={0} className="inline-flex min-h-11 items-center font-medium text-primary" onClick={() => setPaying(r)} onKeyDown={(e) => e.key === 'Enter' && setPaying(r)}>{t('Record payment')}</span>
                  </div>
                )}
              />
            )}
            {paying && <RecordPaymentSheet key={paying._id} open onClose={() => setPaying(null)} stayId={paying.stayId} defaultPaise={paying.balancePaise} />}
          </>
        )}
      </Query>
    </>
  );
}

export function InvoicesPage() {
  const { t } = useTranslation();
  const { orgPath } = useAuth();
  const { query: filter } = usePropertyFilter();
  const [status, setStatus] = useState('');
  const [period, setPeriod] = useState('');
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ page: String(page), ...(status && { status }), ...(period && { period }) });
  const query = useGetPage<any>(orgPath(`/invoices?${params}&${filter}`));
  const generate = useSend<{ period: string }>('post', orgPath('/invoices/generate'));
  const [open, setOpen] = useState<any>(null);
  const [voiding, setVoiding] = useState(false);
  const voidInvoice = useSend<{ reason: string }>('post', () => orgPath(`/invoices/${open?._id}/void`));
  return (
    <>
      <PageHeader title={t('Invoices')} actions={<Button variant="secondary" loading={generate.isPending} onClick={() => generate.mutate({ period: currentPeriod() })}>{t('Generate for {{month}}', { month: formatPeriod(currentPeriod()) })}</Button>} />
      {generate.data && <p className="mb-3 text-success-text">{t('{{created}} created, {{skipped}} already existed.', { created: generate.data.created, skipped: generate.data.skipped })}</p>}
      <FormError error={generate.error} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Select aria-label={t('Status')} className="w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">{t('All statuses')}</option>
          {['due', 'partially_paid', 'overdue', 'paid', 'void'].map((s) => <option key={s} value={s}>{t(s)}</option>)}
        </Select>
        <Input aria-label={t('Period')} type="month" className="w-auto" value={period} onChange={(e) => { setPeriod(e.target.value); setPage(1); }} />
      </div>
      <Query query={query}>
        {({ items, meta }) =>
          items.length === 0 ? <EmptyState title={t('No invoices')} /> : (
            <>
              <DataList
                rows={items}
                rowKey={(i) => i._id}
                onRow={setOpen}
                columns={[
                  { header: t('Number'), cell: (i) => i.number },
                  { header: t('Period'), cell: (i) => (i.period ? formatPeriod(i.period) : t(i.type)) },
                  { header: t('Total'), align: 'right', cell: (i) => <Money paise={i.totalPaise} /> },
                  { header: t('Paid'), align: 'right', cell: (i) => <Money paise={i.paidPaise} /> },
                  { header: t('Balance'), align: 'right', cell: (i) => <Money paise={i.balancePaise} /> },
                  { header: t('Due'), cell: (i) => formatDate(i.dueDate) },
                  { header: t('Status'), cell: (i) => <StatusBadge kind="invoice" status={i.status} /> },
                ]}
                mobile={(i) => (
                  <>
                    <div className="flex justify-between gap-2"><span className="truncate font-medium">{i.number}</span><Money paise={i.balancePaise} /></div>
                    <div className="flex justify-between gap-2"><span className="text-xs text-text-muted">{formatDate(i.dueDate)}</span><StatusBadge kind="invoice" status={i.status} /></div>
                  </>
                )}
              />
              <Pagination page={meta.page} totalPages={meta.totalPages} onChange={setPage} />
            </>
          )
        }
      </Query>
      <Sheet open={Boolean(open)} onClose={() => setOpen(null)} title={open?.number ?? ''}>
        {open && (
          <div className="space-y-3">
            <StatusBadge kind="invoice" status={open.status} />
            <ul className="space-y-1">
              {open.lineItems.map((line: any, i: number) => <li key={i} className="flex justify-between gap-2"><span>{line.label}</span><Money paise={line.amountPaise} /></li>)}
            </ul>
            <div className="border-t border-border pt-2">
              {open.taxPaise > 0 && <p className="flex justify-between"><span>{t('Tax')}</span><Money paise={open.taxPaise} /></p>}
              <p className="flex justify-between font-semibold"><span>{t('Total')}</span><Money paise={open.totalPaise} /></p>
              <p className="flex justify-between"><span>{t('Balance')}</span><Money paise={open.balancePaise} /></p>
            </div>
            <Button variant="secondary" block onClick={() => void openPdf(orgPath(`/invoices/${open._id}/pdf`))}>{t('Open PDF')}</Button>
            {!['paid', 'void'].includes(open.status) && open.paidPaise === 0 && <Button variant="danger" block onClick={() => setVoiding(true)}>{t('Void invoice')}</Button>}
          </div>
        )}
      </Sheet>
      <Confirm
        open={voiding}
        onClose={() => setVoiding(false)}
        title={t('Void invoice')}
        text={t('This cannot be undone and is recorded in the audit log.')}
        action={t('Void invoice')}
        loading={voidInvoice.isPending}
        error={voidInvoice.error}
        onConfirm={() => voidInvoice.mutate({ reason: 'Voided by owner' }, { onSuccess: () => { setVoiding(false); setOpen(null); } })}
      />
    </>
  );
}

export function PaymentsPage() {
  const { t } = useTranslation();
  const { orgPath } = useAuth();
  const [page, setPage] = useState(1);
  const query = useGetPage<any>(orgPath(`/payments?page=${page}`));
  return (
    <>
      <PageHeader title={t('Payments')} />
      <Query query={query}>
        {({ items, meta }) =>
          items.length === 0 ? <EmptyState title={t('No payments yet')} /> : (
            <>
              <DataList
                rows={items}
                rowKey={(p) => p._id}
                onRow={(p) => void openPdf(orgPath(`/payments/${p._id}/receipt`))}
                columns={[
                  { header: t('Receipt'), cell: (p) => p.receiptNumber },
                  { header: t('Paid on'), cell: (p) => formatDate(p.paidAt) },
                  { header: t('Mode'), cell: (p) => <span className="capitalize">{p.mode.replace('_', ' ')}</span> },
                  { header: t('Amount'), align: 'right', cell: (p) => <Money paise={p.amountPaise} /> },
                ]}
                mobile={(p) => <div className="flex justify-between gap-2"><span className="truncate">{p.receiptNumber}</span><Money paise={p.amountPaise} /></div>}
              />
              <Pagination page={meta.page} totalPages={meta.totalPages} onChange={setPage} />
            </>
          )
        }
      </Query>
    </>
  );
}

export function ElectricityPage() {
  const { t } = useTranslation();
  const { orgPath } = useAuth();
  const properties = useProperties();
  const { propertyId } = usePropertyFilter();
  const active = propertyId || properties.data?.[0]?._id || '';
  const map = useGet<any>(active ? orgPath(`/properties/${active}/bedmap`) : null);
  const rooms: any[] = map.data?.floors.flatMap((f: any) => f.rooms) ?? [];
  const [form, setForm] = useState({ roomId: '', period: currentPeriod(), startUnits: '', endUnits: '', rate: '10' });
  const save = useSend('post', orgPath('/electricity-readings'));
  const body = (apply: boolean) => ({ roomId: form.roomId, period: form.period, startUnits: Number(form.startUnits), endUnits: Number(form.endUnits), ratePerUnitPaise: rupeesToPaise(form.rate), apply });
  const bind = (key: keyof typeof form) => ({ value: form[key], onChange: (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value }) });
  return (
    <>
      <PageHeader title={t('Electricity')} subtitle={t('Billed one month later, as a separate invoice.')} />
      <Card className="max-w-[720px] space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('Room')}>
            <Select {...bind('roomId')}>
              <option value="">{t('Choose a room')}</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.number}</option>)}
            </Select>
          </Field>
          <Field label={t('Month')}><Input type="month" {...bind('period')} /></Field>
          <Field label={t('Start units')}><Input inputMode="decimal" {...bind('startUnits')} /></Field>
          <Field label={t('End units')}><Input inputMode="decimal" {...bind('endUnits')} /></Field>
          <Field label={t('Rate per unit (₹)')}><Input inputMode="decimal" {...bind('rate')} /></Field>
        </div>
        <FormError error={save.error} />
        <div className="flex gap-2">
          <Button variant="secondary" disabled={!form.roomId} loading={save.isPending} onClick={() => save.mutate(body(false))}>{t('Preview split')}</Button>
          <Button disabled={!save.data || save.data.appliedToInvoices} onClick={() => save.mutate(body(true))}>{t('Add to invoices')}</Button>
        </div>
        {save.data && (
          <>
            <CardTitle>{t('Total {{amount}}', { amount: formatINR(save.data.totalPaise) })}</CardTitle>
            <ul>{save.data.splits.map((s: any) => <li key={s.stayId} className="flex justify-between"><span>{t('{{days}} days', { days: s.days })}</span><Money paise={s.amountPaise} /></li>)}</ul>
            {save.data.appliedToInvoices && <p className="text-success-text">{t('Added to invoices.')}</p>}
          </>
        )}
      </Card>
    </>
  );
}
