import { CreateStayBody, daysInMonth, proRatePaise } from '@roomora/types';
import { CheckCircle2, MessageCircle, Phone } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Button, Card, CardTitle, Confirm, DataList, EmptyState, Field, FormError, Input, Money, PageHeader, Pagination, Query, SecureImage, Select, Sheet, StatusBadge, Tabs, Textarea } from '../../components/ui';
import { useGet, useGetPage, useSend } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { displayPhone, formatDate, formatINR, formatPeriod, paiseToRupees, rupeesToPaise, todayInput } from '../../lib/format';
import { useProperties, usePropertyFilter } from '../../lib/property';
import { RecordPaymentSheet } from '../billing/pages';

interface ResidentRow {
  stayId: string;
  name: string;
  phone: string;
  property: string;
  room: string;
  bed: string;
  status: string;
  joinDate: string;
  rentPaise: number;
  balancePaise: number;
  kycStatus: string;
}

type Tab = 'active' | 'notice' | 'booked' | 'checked_out';

export function ResidentsPage() {
  const { t } = useTranslation();
  const { orgPath } = useAuth();
  const navigate = useNavigate();
  const { query: filter } = usePropertyFilter();
  const [tab, setTab] = useState<Tab>('active');
  const [search, setSearch] = useState('');
  const [dues, setDues] = useState(false);
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ status: tab, page: String(page), ...(search && { q: search }), ...(dues && { hasDues: 'true' }) });
  const query = useGetPage<ResidentRow>(orgPath(`/residents?${params}&${filter}`));
  const change = (fn: () => void) => {
    fn();
    setPage(1);
  };
  return (
    <>
      <PageHeader title={t('Residents')} actions={<Link to="/app/residents/new"><Button>{t('Add resident')}</Button></Link>} />
      <Tabs
        value={tab}
        onChange={(v) => change(() => setTab(v))}
        tabs={[
          { value: 'active', label: t('Active') },
          { value: 'notice', label: t('On notice') },
          { value: 'booked', label: t('Booked') },
          { value: 'checked_out', label: t('Past') },
        ]}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input className="max-w-sm" aria-label={t('Search')} placeholder={t('Search name or phone')} value={search} onChange={(e) => change(() => setSearch(e.target.value))} />
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-5" checked={dues} onChange={(e) => change(() => setDues(e.target.checked))} /> {t('Has dues')}</label>
      </div>
      <Query query={query}>
        {({ items, meta }) =>
          items.length === 0 ? (
            <EmptyState title={t('No residents here')} text={t('Add your first resident to start collecting rent.')} action={<Link to="/app/residents/new"><Button>{t('Add resident')}</Button></Link>} />
          ) : (
            <>
              <DataList
                rows={items}
                rowKey={(r) => r.stayId}
                onRow={(r) => navigate(`/app/residents/${r.stayId}`)}
                columns={[
                  { header: t('Resident'), cell: (r) => <><p className="font-medium">{r.name}</p><p className="text-xs text-text-muted">{displayPhone(r.phone)}</p></> },
                  { header: t('Room/Bed'), cell: (r) => `${r.room} · ${r.bed}` },
                  { header: t('Joined'), cell: (r) => formatDate(r.joinDate) },
                  { header: t('Rent'), align: 'right', cell: (r) => <Money paise={r.rentPaise} /> },
                  { header: t('Balance'), align: 'right', cell: (r) => <Money paise={r.balancePaise} /> },
                  { header: t('KYC'), cell: (r) => <StatusBadge kind="kyc" status={r.kycStatus} /> },
                  { header: t('Status'), cell: (r) => <StatusBadge kind="stay" status={r.status} /> },
                ]}
                mobile={(r) => (
                  <>
                    <div className="flex items-center justify-between gap-2"><p className="truncate font-medium">{r.name}</p><StatusBadge kind="stay" status={r.status} /></div>
                    <p className="text-xs text-text-muted">{t('Room {{room}}, bed {{bed}}', { room: r.room, bed: r.bed })}</p>
                    <p className="text-xs">{t('Balance')}: <Money paise={r.balancePaise} /></p>
                  </>
                )}
              />
              <Pagination page={meta.page} totalPages={meta.totalPages} onChange={setPage} />
            </>
          )
        }
      </Query>
    </>
  );
}

interface AvailableBed {
  id: string;
  label: string;
  status: string;
  premiumPaise: number;
  availableFrom?: string;
  room: { id: string; number: string; sharing: number; isAc: boolean; rentPerBedPaise?: number };
}

const STEPS = ['Bed', 'Resident', 'Rent', 'Review'];

export function AddResidentPage() {
  const { t } = useTranslation();
  const { orgPath } = useAuth();
  const [params] = useSearchParams();
  const properties = useProperties();
  const { propertyId: filtered } = usePropertyFilter();
  const [step, setStep] = useState(0);
  const [propertyId, setPropertyId] = useState(params.get('property') ?? filtered);
  const activeProperty = propertyId || properties.data?.[0]?._id || '';
  const [joinDate, setJoinDate] = useState(todayInput());
  const [bedId, setBedId] = useState(params.get('bed') ?? '');
  const [form, setForm] = useState({ phone: '', name: '', gender: '', occupation: '' });
  const [rent, setRent] = useState('');
  const [deposit, setDeposit] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [result, setResult] = useState<{ inviteUrl: string; stay: { _id: string } } | null>(null);
  const beds = useGet<AvailableBed[]>(activeProperty ? orgPath(`/beds/available?propertyId=${activeProperty}&from=${joinDate}`) : null);
  const create = useSend('post', orgPath('/stays'));

  const property = properties.data?.find((p) => p._id === activeProperty);
  const bed = beds.data?.find((b) => b.id === bedId);
  const rules = property?.rentRules;
  const suggestedRent = bed && rules ? (bed.room.rentPerBedPaise ?? rules.rentBySharingPaise[bed.room.sharing]) : 0;
  const rentPaise = rent ? rupeesToPaise(rent) : suggestedRent;
  const suggestedDeposit = rules ? (rules.deposit.mode === 'months' ? Math.round(rentPaise * rules.deposit.value) : rules.deposit.value) : 0;
  const depositPaise = deposit ? rupeesToPaise(deposit) : suggestedDeposit;
  const [year, month, day] = joinDate.split('-').map(Number);
  const firstMonth = rentPaise ? proRatePaise(rentPaise + (bed?.premiumPaise ?? 0), day, daysInMonth(year, month)) : 0;

  function submit() {
    const parsed = CreateStayBody.safeParse({
      bedId,
      phone: form.phone,
      name: form.name,
      rentPaise,
      depositPaise,
      joinDate,
      ...(form.gender && { gender: form.gender }),
      ...(form.occupation && { occupation: form.occupation }),
    });
    if (!parsed.success) {
      setProblems(parsed.error.issues.map((i) => i.message));
      return;
    }
    setProblems([]);
    create.mutate(parsed.data, { onSuccess: setResult });
  }

  if (result) {
    const text = encodeURIComponent(`${t('Your room at {{name}} is booked. Complete your details here:', { name: property?.name })} ${result.inviteUrl}`);
    return (
      <Card className="mx-auto max-w-lg text-center">
        <CheckCircle2 className="mx-auto mb-2 size-10 text-success-text" aria-hidden />
        <h1 className="text-xl font-bold">{t('{{name}} is booked', { name: form.name })}</h1>
        <p className="my-3 break-all rounded-sm bg-surface-muted p-3 text-sm">{result.inviteUrl}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <a href={`https://wa.me/?text=${text}`} target="_blank" rel="noreferrer"><Button block><MessageCircle className="size-4" aria-hidden /> {t('Share on WhatsApp')}</Button></a>
          <Link to={`/app/residents/${result.stay._id}`}><Button variant="secondary" block>{t('View resident')}</Button></Link>
        </div>
      </Card>
    );
  }

  const canNext = [Boolean(bedId && bed), form.name.length > 0 && form.phone.length === 10, rentPaise > 0, true][step];

  return (
    <div className="mx-auto max-w-[720px]">
      <PageHeader title={t('Add resident')} />
      <ol className="mb-4 flex gap-2" aria-label={t('Steps')}>
        {STEPS.map((label, i) => (
          <li key={label} aria-current={i === step ? 'step' : undefined} className={`flex-1 border-t-4 pt-1 text-xs font-medium ${i <= step ? 'border-primary text-primary' : 'border-border text-text-muted'}`}>
            <span className="md:hidden">{i + 1}</span><span className="hidden md:inline">{i + 1}. {t(label)}</span>
          </li>
        ))}
      </ol>
      <Card>
        {step === 0 && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('Property')}>
                <Select value={activeProperty} onChange={(e) => { setPropertyId(e.target.value); setBedId(''); }}>
                  {properties.data?.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
                </Select>
              </Field>
              <Field label={t('Join date')}><Input type="date" value={joinDate} onChange={(e) => setJoinDate(e.target.value)} /></Field>
            </div>
            <Query query={beds as never} skeleton={<p className="text-text-muted">{t('Loading beds…')}</p>}>
              {() =>
                beds.data?.length ? (
                  <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {beds.data.map((b) => (
                      <li key={b.id}>
                        <button
                          type="button"
                          aria-pressed={b.id === bedId}
                          onClick={() => setBedId(b.id)}
                          className={`min-h-11 w-full rounded-md border p-2 text-left text-sm ${b.id === bedId ? 'border-primary bg-primary-soft' : 'border-border'}`}
                        >
                          <span className="font-medium">{b.room.number} · {b.label}</span>
                          <span className="block text-xs text-text-muted">{t('{{sharing}}-sharing', { sharing: b.room.sharing })}{b.room.isAc ? ` · ${t('AC')}` : ''}</span>
                          {b.availableFrom && <span className="block text-xs text-warning-text">{t('Free after {{date}}', { date: formatDate(b.availableFrom) })}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : <EmptyState title={t('No beds free on this date')} />
              }
            </Query>
          </div>
        )}
        {step === 1 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('Mobile number')}><Input inputMode="numeric" maxLength={10} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '') })} /></Field>
            <Field label={t('Full name')}><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label={t('Gender')}>
              <Select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                <option value="">{t('Prefer not to say')}</option><option value="female">{t('Female')}</option><option value="male">{t('Male')}</option><option value="other">{t('Other')}</option>
              </Select>
            </Field>
            <Field label={t('Occupation')}>
              <Select value={form.occupation} onChange={(e) => setForm({ ...form, occupation: e.target.value })}>
                <option value="">{t('Not set')}</option><option value="student">{t('Student')}</option><option value="working">{t('Working')}</option><option value="other">{t('Other')}</option>
              </Select>
            </Field>
          </div>
        )}
        {step === 2 && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('Monthly rent (₹)')}><Input inputMode="numeric" value={rent || paiseToRupees(suggestedRent)} onChange={(e) => setRent(e.target.value)} /></Field>
              <Field label={t('Deposit (₹)')}><Input inputMode="numeric" value={deposit || paiseToRupees(suggestedDeposit)} onChange={(e) => setDeposit(e.target.value)} /></Field>
            </div>
            <p className="rounded-sm bg-primary-soft p-3 text-sm">{t('First month: {{amount}} from {{date}}.', { amount: formatINR(firstMonth), date: formatDate(joinDate) })}</p>
          </div>
        )}
        {step === 3 && (
          <div className="space-y-3">
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-text-muted">{t('Resident')}</dt><dd>{form.name}</dd>
              <dt className="text-text-muted">{t('Phone')}</dt><dd>+91 {form.phone}</dd>
              <dt className="text-text-muted">{t('Bed')}</dt><dd>{bed?.room.number} · {bed?.label}</dd>
              <dt className="text-text-muted">{t('Rent')}</dt><dd><Money paise={rentPaise} /></dd>
              {Boolean(bed?.premiumPaise) && <><dt className="text-text-muted">{t('Bed premium')}</dt><dd><Money paise={bed!.premiumPaise} /></dd></>}
              <dt className="text-text-muted">{t('Deposit')}</dt><dd><Money paise={depositPaise} /></dd>
              <dt className="text-text-muted">{t('Joining')}</dt><dd>{formatDate(joinDate)}</dd>
            </dl>
            {problems.map((p) => <p key={p} role="alert" className="text-sm text-danger-text">{p}</p>)}
            <FormError error={create.error} />
          </div>
        )}
      </Card>
      <div className="safe-bottom sticky bottom-16 mt-4 flex justify-between gap-2 md:bottom-0">
        <Button variant="secondary" disabled={step === 0} onClick={() => setStep(step - 1)}>{t('Back')}</Button>
        {step < 3 ? <Button disabled={!canNext} onClick={() => setStep(step + 1)}>{t('Next')}</Button> : <Button loading={create.isPending} onClick={submit}>{t('Create booking')}</Button>}
      </div>
    </div>
  );
}

function CheckoutSheet({ stayId, open, onClose }: { stayId: string; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { orgPath } = useAuth();
  const [exitDate, setExitDate] = useState(todayInput());
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [checks, setChecks] = useState({ keys: false, room: false });
  const deductions = label && amount ? [{ label, amountPaise: rupeesToPaise(amount) }] : [];
  const body = { exitDate, deductions };
  const preview = useSend<typeof body>('post', orgPath(`/stays/${stayId}/checkout/preview`));
  const confirm = useSend<typeof body>('post', orgPath(`/stays/${stayId}/checkout`));
  const summary = preview.data;
  return (
    <Sheet open={open} onClose={onClose} title={t('Check out')}>
      <div className="space-y-3">
        <Field label={t('Exit date')}><Input type="date" value={exitDate} onChange={(e) => setExitDate(e.target.value)} /></Field>
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" className="size-5" checked={checks.keys} onChange={(e) => setChecks({ ...checks, keys: e.target.checked })} /> {t('Keys returned')}</label>
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" className="size-5" checked={checks.room} onChange={(e) => setChecks({ ...checks, room: e.target.checked })} /> {t('Room inspected')}</label>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('Deduction')}><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('Broken chair')} /></Field>
          <Field label={t('Amount (₹)')}><Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        </div>
        <Button variant="secondary" block loading={preview.isPending} onClick={() => preview.mutate(body)}>{t('Calculate settlement')}</Button>
        <FormError error={preview.error ?? confirm.error} />
        {summary && (
          <Card>
            <dl className="grid grid-cols-2 gap-1 text-sm">
              <dt>{t('Deposit paid')}</dt><dd className="text-right"><Money paise={summary.depositPaidPaise} /></dd>
              <dt>{t('Dues')}</dt><dd className="text-right"><Money paise={summary.duesPaise} /></dd>
              <dt>{t('Deductions')}</dt><dd className="text-right"><Money paise={summary.deductionsPaise} /></dd>
              <dt className="font-semibold">{summary.refundPaise >= 0 ? t('Refund to resident') : t('Resident still owes')}</dt>
              <dd className="text-right font-semibold"><Money paise={Math.abs(summary.refundPaise)} /></dd>
            </dl>
            <Button block className="mt-3" variant="danger" disabled={!checks.keys || !checks.room} loading={confirm.isPending} onClick={() => confirm.mutate(body, { onSuccess: onClose })}>{t('Confirm check-out')}</Button>
          </Card>
        )}
      </div>
    </Sheet>
  );
}

function KycTab({ stayId, profile }: { stayId: string; profile: any }) {
  const { t } = useTranslation();
  const { orgPath } = useAuth();
  const verify = useSend('post', orgPath(`/stays/${stayId}/verify-kyc`));
  const [reason, setReason] = useState('');
  return (
    <Card className="space-y-3">
      <StatusBadge kind="kyc" status={profile.kycStatus} />
      {profile.idType && <p>{t('ID')}: <span className="uppercase">{profile.idType}</span> ···· {profile.idNumberLast4}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {profile.idFrontKey && <SecureImage fileKey={profile.idFrontKey} alt={t('ID front')} />}
        {profile.idBackKey && <SecureImage fileKey={profile.idBackKey} alt={t('ID back')} />}
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div><dt className="text-text-muted">{t('Company or college')}</dt><dd>{profile.organizationName || '—'}{profile.designation ? `, ${profile.designation}` : ''}</dd></div>
        <div><dt className="text-text-muted">{t('Vehicle')}</dt><dd className="capitalize">{profile.vehicleType && profile.vehicleType !== 'none' ? [t(profile.vehicleType), profile.vehicleModel, profile.vehicleNumber].filter(Boolean).join(' · ') : t('None')}</dd></div>
        <div><dt className="text-text-muted">{t('Emergency contact')}</dt><dd>{profile.emergencyContact?.name || '—'}</dd></div>
      </dl>
      {profile.companyProofKey && <SecureImage fileKey={profile.companyProofKey} alt={t('Company proof')} />}
      {!profile.idFrontKey && <p className="text-text-muted">{t('The resident has not uploaded documents yet. You can still approve after checking them in person.')}</p>}
      <Field label={t('Reason, if rejecting')}><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <FormError error={verify.error} />
      <div className="flex gap-2">
        <Button loading={verify.isPending} onClick={() => verify.mutate({ approve: true })}>{t('Verify')}</Button>
        <Button variant="secondary" onClick={() => verify.mutate({ approve: false, reason })}>{t('Reject')}</Button>
      </div>
    </Card>
  );
}

export function ResidentDetailPage() {
  const { t } = useTranslation();
  const { stayId } = useParams();
  const { orgPath } = useAuth();
  const [tab, setTab] = useState<'overview' | 'kyc' | 'invoices' | 'payments'>('overview');
  const [sheet, setSheet] = useState<'pay' | 'checkout' | 'notice' | 'cancel' | null>(null);
  const query = useGet<any>(orgPath(`/stays/${stayId}`));
  const notice = useSend('post', orgPath(`/stays/${stayId}/notice`));
  const cancel = useSend('post', orgPath(`/stays/${stayId}/cancel`));
  return (
    <Query query={query}>
      {(data) => {
        const { stay, profile } = data;
        const phone = String(data.phone ?? '').replace(/^91/, '');
        return (
          <>
            <Card className="mb-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="text-2xl font-bold">{profile?.fullName}</h1>
                  <p className="text-text-muted">{data.property} · {t('Room {{room}}, bed {{bed}}', { room: data.room, bed: data.bed })}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <StatusBadge kind="stay" status={stay.status} />
                    <span>{t('Balance')}: <Money paise={data.balancePaise} className="font-semibold" /></span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a href={`tel:+91${phone}`}><Button variant="secondary" aria-label={t('Call')}><Phone className="size-4" aria-hidden /></Button></a>
                  <a href={`https://wa.me/91${phone}`} target="_blank" rel="noreferrer"><Button variant="secondary" aria-label="WhatsApp"><MessageCircle className="size-4" aria-hidden /></Button></a>
                  {['active', 'notice', 'booked'].includes(stay.status) && data.balancePaise > 0 && <Button onClick={() => setSheet('pay')}>{t('Record payment')}</Button>}
                  {stay.status === 'active' && <Button variant="secondary" onClick={() => setSheet('notice')}>{t('Give notice')}</Button>}
                  {['active', 'notice'].includes(stay.status) && <Button variant="secondary" onClick={() => setSheet('checkout')}>{t('Check out')}</Button>}
                  {stay.status === 'booked' && <Button variant="secondary" onClick={() => setSheet('cancel')}>{t('Cancel booking')}</Button>}
                </div>
              </div>
            </Card>
            <Tabs
              value={tab}
              onChange={setTab}
              tabs={[
                { value: 'overview', label: t('Overview') },
                { value: 'kyc', label: t('KYC') },
                { value: 'invoices', label: t('Invoices') },
                { value: 'payments', label: t('Payments') },
              ]}
            />
            {tab === 'overview' && (
              <Card>
                <CardTitle>{t('Stay details')}</CardTitle>
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div><dt className="text-text-muted">{t('Joined')}</dt><dd>{formatDate(stay.joinDate)}</dd></div>
                  <div><dt className="text-text-muted">{t('Rent')}</dt><dd><Money paise={stay.rentPaise} /></dd></div>
                  <div><dt className="text-text-muted">{t('Bed premium')}</dt><dd><Money paise={stay.premiumPaise} /></dd></div>
                  <div><dt className="text-text-muted">{t('Deposit')}</dt><dd><Money paise={stay.depositPaidPaise} /> / <Money paise={stay.depositPaise} /></dd></div>
                  {stay.expectedExitDate && <div><dt className="text-text-muted">{t('Expected exit')}</dt><dd>{formatDate(stay.expectedExitDate)}</dd></div>}
                  {stay.settlement?.refundPaise !== undefined && <div><dt className="text-text-muted">{t('Settlement')}</dt><dd><Money paise={stay.settlement.refundPaise} /></dd></div>}
                </dl>
              </Card>
            )}
            {tab === 'kyc' && profile && <KycTab stayId={stay._id} profile={profile} />}
            {tab === 'invoices' && (
              <DataList
                rows={data.invoices as any[]}
                rowKey={(i) => i._id}
                columns={[
                  { header: t('Number'), cell: (i) => i.number },
                  { header: t('Period'), cell: (i) => (i.period ? formatPeriod(i.period) : t(i.type)) },
                  { header: t('Total'), align: 'right', cell: (i) => <Money paise={i.totalPaise} /> },
                  { header: t('Balance'), align: 'right', cell: (i) => <Money paise={i.balancePaise} /> },
                  { header: t('Status'), cell: (i) => <StatusBadge kind="invoice" status={i.status} /> },
                ]}
                mobile={(i) => <div className="flex items-center justify-between gap-2"><span>{i.number}</span><Money paise={i.balancePaise} /><StatusBadge kind="invoice" status={i.status} /></div>}
              />
            )}
            {tab === 'payments' && (
              data.payments.length ? (
                <DataList
                  rows={data.payments as any[]}
                  rowKey={(p) => p._id}
                  columns={[
                    { header: t('Receipt'), cell: (p) => p.receiptNumber },
                    { header: t('Paid on'), cell: (p) => formatDate(p.paidAt) },
                    { header: t('Mode'), cell: (p) => p.mode },
                    { header: t('Amount'), align: 'right', cell: (p) => <Money paise={p.amountPaise} /> },
                  ]}
                  mobile={(p) => <div className="flex justify-between gap-2"><span>{p.receiptNumber}</span><Money paise={p.amountPaise} /></div>}
                />
              ) : <EmptyState title={t('No payments yet')} />
            )}
            <RecordPaymentSheet open={sheet === 'pay'} onClose={() => setSheet(null)} stayId={stay._id} />
            <CheckoutSheet open={sheet === 'checkout'} onClose={() => setSheet(null)} stayId={stay._id} />
            <Confirm open={sheet === 'notice'} onClose={() => setSheet(null)} title={t('Give notice')} text={t('The exit date is set from the notice period in the rent rules.')} action={t('Give notice')} loading={notice.isPending} error={notice.error} onConfirm={() => notice.mutate({}, { onSuccess: () => setSheet(null) })} />
            <Confirm open={sheet === 'cancel'} onClose={() => setSheet(null)} title={t('Cancel booking')} text={t('The bed becomes vacant and unpaid invoices are voided.')} action={t('Cancel booking')} loading={cancel.isPending} error={cancel.error} onConfirm={() => cancel.mutate({}, { onSuccess: () => setSheet(null) })} />
          </>
        );
      }}
    </Query>
  );
}
