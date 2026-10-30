import { CreatePropertyBody, proRatePaise } from '@roomora/types';
import { QRCodeSVG } from 'qrcode.react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { Button, Card, CardTitle, EmptyState, Field, FormError, Input, PageHeader, Query, Select, Tabs, Textarea } from '../../components/ui';
import { useGet, useSend } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatINR, paiseToRupees, rupeesToPaise } from '../../lib/format';
import { useProperties } from '../../lib/property';

const AMENITIES = ['WiFi', 'AC', 'Food', 'Laundry', 'Parking', 'CCTV', 'Power backup', 'Housekeeping', 'Gym'];

export function PropertiesPage() {
  const { t } = useTranslation();
  const query = useProperties();
  return (
    <>
      <PageHeader title={t('Properties')} actions={<Link to="/app/properties/new"><Button>{t('Add property')}</Button></Link>} />
      <Query query={query}>
        {(items) =>
          items.length === 0 ? (
            <EmptyState title={t('No properties yet')} text={t('Add your first property to set up rooms and beds.')} action={<Link to="/app/properties/new"><Button>{t('Add property')}</Button></Link>} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((property) => {
                const pct = property.beds ? Math.round((property.occupied / property.beds) * 100) : 0;
                return (
                  <Link key={property._id} to={`/app/properties/${property._id}`} className="rounded-md border border-border bg-surface p-4 shadow-card hover:border-primary">
                    <h2 className="font-semibold">{property.name}</h2>
                    <p className="text-text-muted">{property.address?.city}</p>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-muted" role="img" aria-label={t('{{pct}}% occupied', { pct })}>
                      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-2 text-xs text-text-muted">{t('{{pct}}% occupied · {{vacant}} vacant of {{beds}}', { pct, vacant: property.vacant, beds: property.beds })}</p>
                  </Link>
                );
              })}
            </div>
          )
        }
      </Query>
    </>
  );
}

const blank = { name: '', line1: '', city: '', state: '', pincode: '', type: 'coliving', amenities: [] as string[] };

export function PropertyForm({ onDone }: { onDone: (id: string) => void }) {
  const { t } = useTranslation();
  const { orgPath } = useAuth();
  const [form, setForm] = useState(blank);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const create = useSend('post', orgPath('/properties'));
  const set = (key: keyof typeof blank) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  function submit(e: FormEvent) {
    e.preventDefault();
    const body = {
      name: form.name,
      type: form.type,
      amenities: form.amenities,
      address: { line1: form.line1, city: form.city, state: form.state, pincode: form.pincode },
    };
    const parsed = CreatePropertyBody.safeParse(body); // same schema the API validates with
    if (!parsed.success) {
      setProblems(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path.at(-1)), i.message])));
      return;
    }
    setProblems({});
    create.mutate(parsed.data, { onSuccess: (property) => onDone(property._id) });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label={t('Property name')} error={problems.name}><Input value={form.name} onChange={set('name')} /></Field>
      <Field label={t('Address')} error={problems.line1}><Input value={form.line1} onChange={set('line1')} /></Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t('City')} error={problems.city}><Input value={form.city} onChange={set('city')} /></Field>
        <Field label={t('State')} error={problems.state}><Input value={form.state} onChange={set('state')} /></Field>
        <Field label={t('Pincode')} error={problems.pincode}><Input inputMode="numeric" maxLength={6} value={form.pincode} onChange={set('pincode')} /></Field>
      </div>
      <Field label={t('Type')}>
        <Select value={form.type} onChange={set('type')}>
          <option value="boys">{t('Boys')}</option>
          <option value="girls">{t('Girls')}</option>
          <option value="coliving">{t('Co-living')}</option>
          <option value="mixed">{t('Mixed')}</option>
        </Select>
      </Field>
      <fieldset>
        <legend className="mb-1 text-xs font-medium text-text-muted">{t('Amenities')}</legend>
        <div className="flex flex-wrap gap-2">
          {AMENITIES.map((a) => {
            const on = form.amenities.includes(a);
            return (
              <button
                key={a}
                type="button"
                aria-pressed={on}
                onClick={() => setForm({ ...form, amenities: on ? form.amenities.filter((x) => x !== a) : [...form.amenities, a] })}
                className={`min-h-11 rounded-full border px-3 text-sm ${on ? 'border-primary bg-primary-soft text-primary' : 'border-border text-text-muted'}`}
              >
                {t(a)}
              </button>
            );
          })}
        </div>
      </fieldset>
      <FormError error={create.error} />
      <Button type="submit" loading={create.isPending}>{t('Save')}</Button>
    </form>
  );
}

export function NewPropertyPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <>
      <PageHeader title={t('Add property')} />
      <Card className="max-w-[720px]"><PropertyForm onDone={(id) => navigate(`/app/properties/${id}`)} /></Card>
    </>
  );
}

interface Row {
  floor: number;
  number: string;
  sharing: number;
  isAc: boolean;
  hasAttachedBath: boolean;
  rent: string;
}

export function RoomsGrid({ propertyId, onDone }: { propertyId: string; onDone?: () => void }) {
  const { t } = useTranslation();
  const { orgPath } = useAuth();
  const [floors, setFloors] = useState(2);
  const [perFloor, setPerFloor] = useState(4);
  const [sharing, setSharing] = useState(2);
  const [rows, setRows] = useState<Row[]>([]);
  const save = useSend('post', orgPath(`/properties/${propertyId}/rooms/bulk`));

  const fill = () =>
    setRows(
      Array.from({ length: floors }, (_, f) =>
        Array.from({ length: perFloor }, (_, r) => ({
          floor: f + 1,
          number: `${f + 1}${String(r + 1).padStart(2, '0')}`,
          sharing,
          isAc: false,
          hasAttachedBath: false,
          rent: '',
        })),
      ).flat(),
    );
  const patch = (i: number, change: Partial<Row>) => setRows(rows.map((r, n) => (n === i ? { ...r, ...change } : r)));
  const beds = rows.reduce((sum, r) => sum + r.sharing, 0);

  function submit() {
    const levels = [...new Set(rows.map((r) => r.floor))];
    save.mutate(
      {
        floors: levels.map((level) => ({ level, label: t('Floor {{level}}', { level }) })),
        rooms: rows.map((r) => ({
          floorLevel: r.floor,
          number: r.number,
          sharing: r.sharing,
          isAc: r.isAc,
          hasAttachedBath: r.hasAttachedBath,
          ...(r.rent && { rentPerBedPaise: rupeesToPaise(r.rent) }),
        })),
      },
      {
        onSuccess: () => {
          setRows([]);
          onDone?.();
        },
      },
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-4">
        <Field label={t('Floors')}><Input type="number" min={1} max={50} value={floors} onChange={(e) => setFloors(Number(e.target.value))} /></Field>
        <Field label={t('Rooms per floor')}><Input type="number" min={1} max={50} value={perFloor} onChange={(e) => setPerFloor(Number(e.target.value))} /></Field>
        <Field label={t('Sharing')}><Select value={sharing} onChange={(e) => setSharing(Number(e.target.value))}>{[1, 2, 3, 4].map((n) => <option key={n}>{n}</option>)}</Select></Field>
        <Button variant="secondary" onClick={fill}>{t('Quick fill')}</Button>
      </div>
      {rows.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-surface-muted text-left text-xs text-text-muted">
                <tr>{[t('Floor'), t('Room no.'), t('Sharing'), t('AC'), t('Bath'), t('Rent/bed (₹)')].map((h) => <th key={h} scope="col" className="px-2 py-2 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-2 py-1">{row.floor}</td>
                    <td className="px-2 py-1"><Input aria-label={t('Room no.')} value={row.number} onChange={(e) => patch(i, { number: e.target.value })} /></td>
                    <td className="px-2 py-1"><Select aria-label={t('Sharing')} value={row.sharing} onChange={(e) => patch(i, { sharing: Number(e.target.value) })}>{[1, 2, 3, 4].map((n) => <option key={n}>{n}</option>)}</Select></td>
                    <td className="px-2 py-1"><input aria-label={t('AC')} type="checkbox" className="size-5" checked={row.isAc} onChange={(e) => patch(i, { isAc: e.target.checked })} /></td>
                    <td className="px-2 py-1"><input aria-label={t('Bath')} type="checkbox" className="size-5" checked={row.hasAttachedBath} onChange={(e) => patch(i, { hasAttachedBath: e.target.checked })} /></td>
                    <td className="px-2 py-1"><Input aria-label={t('Rent/bed (₹)')} inputMode="numeric" placeholder={t('From rent rules')} value={row.rent} onChange={(e) => patch(i, { rent: e.target.value })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <FormError error={save.error} />
          <Button loading={save.isPending} onClick={submit}>{t('Create {{rooms}} rooms and {{beds}} beds', { rooms: rows.length, beds })}</Button>
        </>
      )}
      {save.isSuccess && <p className="text-success-text">{t('Rooms created.')}</p>}
    </div>
  );
}

export function RentRulesForm({ propertyId, rules }: { propertyId: string; rules: any }) {
  const { t } = useTranslation();
  const { orgPath } = useAuth();
  const [form, setForm] = useState({
    rent2: String(paiseToRupees(rules.rentBySharingPaise['2'])),
    rent1: String(paiseToRupees(rules.rentBySharingPaise['1'])),
    rent3: String(paiseToRupees(rules.rentBySharingPaise['3'])),
    rent4: String(paiseToRupees(rules.rentBySharingPaise['4'])),
    depositMonths: String(rules.deposit.value),
    dueDay: String(rules.dueDay),
    graceDays: String(rules.graceDays),
    noticeDays: String(rules.noticePeriodDays),
    lateFeeMode: rules.lateFee.mode as string,
    lateFee: String(paiseToRupees(rules.lateFee.amountPaise)),
    electricity: rules.electricity.mode as string,
  });
  const save = useSend('put', orgPath(`/properties/${propertyId}/rent-rules`));
  const bind = (key: keyof typeof form) => ({ value: form[key], onChange: (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value }) });
  const example = proRatePaise(rupeesToPaise(form.rent2 || 0), 15, 30);

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate({
      ...rules,
      rentBySharingPaise: { '1': rupeesToPaise(form.rent1), '2': rupeesToPaise(form.rent2), '3': rupeesToPaise(form.rent3), '4': rupeesToPaise(form.rent4) },
      deposit: { mode: 'months', value: Number(form.depositMonths) },
      dueDay: Number(form.dueDay),
      graceDays: Number(form.graceDays),
      noticePeriodDays: Number(form.noticeDays),
      lateFee: { mode: form.lateFeeMode, amountPaise: rupeesToPaise(form.lateFee) },
      electricity: { ...rules.electricity, mode: form.electricity },
    });
  }

  return (
    <form onSubmit={submit} className="max-w-[720px] space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(['1', '2', '3', '4'] as const).map((n) => <Field key={n} label={t('{{n}}-sharing rent (₹)', { n })}><Input inputMode="numeric" {...bind(`rent${n}`)} /></Field>)}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label={t('Deposit (months of rent)')}><Input inputMode="decimal" {...bind('depositMonths')} /></Field>
        <Field label={t('Rent due day (1–28)')}><Input type="number" min={1} max={28} {...bind('dueDay')} /></Field>
        <Field label={t('Grace days')}><Input type="number" min={0} {...bind('graceDays')} /></Field>
        <Field label={t('Notice period (days)')}><Input type="number" min={0} {...bind('noticeDays')} /></Field>
        <Field label={t('Late fee')}>
          <Select {...bind('lateFeeMode')}>
            <option value="none">{t('None')}</option>
            <option value="fixed">{t('Fixed amount')}</option>
            <option value="per_day">{t('Per day')}</option>
          </Select>
        </Field>
        <Field label={t('Late fee amount (₹)')}><Input inputMode="numeric" disabled={form.lateFeeMode === 'none'} {...bind('lateFee')} /></Field>
        <Field label={t('Electricity')}>
          <Select {...bind('electricity')}>
            <option value="included">{t('Included in rent')}</option>
            <option value="meter_split">{t('Split by meter')}</option>
            <option value="fixed">{t('Fixed per bed')}</option>
          </Select>
        </Field>
      </div>
      <p className="rounded-sm bg-primary-soft p-3 text-sm">{t('Example: a 2-sharing resident joining 15 Nov pays {{amount}} for November.', { amount: formatINR(example) })}</p>
      <FormError error={save.error} />
      {save.isSuccess && <p className="text-success-text">{t('Saved.')}</p>}
      <Button type="submit" loading={save.isPending}>{t('Save')}</Button>
    </form>
  );
}

function SettingsTab({ property }: { property: any }) {
  const { t } = useTranslation();
  const { orgPath } = useAuth();
  const [rules, setRules] = useState(property.houseRules ?? '');
  const save = useSend('patch', orgPath(`/properties/${property._id}`));
  return (
    <div className="max-w-[720px] space-y-3">
      <Field label={t('House rules')}><Textarea rows={6} value={rules} onChange={(e) => setRules(e.target.value)} /></Field>
      <FormError error={save.error} />
      <div className="flex gap-2">
        <Button loading={save.isPending} onClick={() => save.mutate({ houseRules: rules })}>{t('Save')}</Button>
        <Button variant="secondary" onClick={() => save.mutate({ isActive: !property.isActive })}>{property.isActive ? t('Disable property') : t('Enable property')}</Button>
      </div>
    </div>
  );
}

export function PropertyDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { orgPath } = useAuth();
  const [tab, setTab] = useState<'overview' | 'rooms' | 'rules' | 'invite' | 'settings'>('overview');
  const query = useGet<any>(orgPath(`/properties/${id}`));
  const inviteUrl = `${location.origin}/join/${id}`;
  return (
    <Query query={query}>
      {(property) => (
        <>
          <PageHeader title={property.name} subtitle={[property.address?.line1, property.address?.city].filter(Boolean).join(', ')} />
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'overview', label: t('Overview') },
              { value: 'rooms', label: t('Rooms') },
              { value: 'rules', label: t('Rent rules') },
              { value: 'invite', label: t('Invite link') },
              { value: 'settings', label: t('Settings') },
            ]}
          />
          {tab === 'overview' && (
            <Card>
              <CardTitle>{t('Amenities')}</CardTitle>
              {property.amenities.length ? <div className="flex flex-wrap gap-2">{property.amenities.map((a: string) => <span key={a} className="rounded-full bg-surface-muted px-3 py-1 text-xs">{t(a)}</span>)}</div> : <p className="text-text-muted">{t('None added.')}</p>}
              <Link to="/app/bedmap" className="mt-4 inline-block text-primary">{t('Open bed map')}</Link>
            </Card>
          )}
          {tab === 'rooms' && <Card><CardTitle>{t('Add rooms')}</CardTitle><RoomsGrid propertyId={property._id} /></Card>}
          {tab === 'rules' && <Card><RentRulesForm propertyId={property._id} rules={property.rentRules} /></Card>}
          {tab === 'invite' && (
            <Card className="max-w-md">
              <CardTitle>{t('Invite link')}</CardTitle>
              <p className="mb-3 text-text-muted">{t('Coming soon: residents will request a bed from this link. For now, book the bed and share the invite it creates.')}</p>
              <div className="w-fit rounded-md bg-white p-3"><QRCodeSVG value={inviteUrl} size={160} /></div>
            </Card>
          )}
          {tab === 'settings' && <Card><SettingsTab property={property} /></Card>}
        </>
      )}
    </Query>
  );
}
