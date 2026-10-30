import { CreateOrgBody, CreatePropertyBody } from '@roomora/types';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Clock, MessageSquareWarning } from 'lucide-react';
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router';
import { Button, Card, Field, FormError, Input, ListSkeleton, MultiUpload, Query, Select, cx } from '../../components/ui';
import { api, useGet } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { displayPhone, formatDate } from '../../lib/format';
import { EMPTY_ADDRESS, LocationPicker, type PgAddress } from '../properties/location';
import { AmenityPicker, problemsOf } from '../properties/pages';

const STEPS = ['Your PG', 'Owner details', 'PG documents'];

type Docs = Record<string, string[]>;

const docsFrom = (org: any): Docs => {
  const docs: Docs = {};
  for (const d of org?.kyc?.docs ?? []) (docs[d.type] ??= []).push(d.key);
  return docs;
};
const docList = (docs: Docs) => Object.entries(docs).flatMap(([type, keys]) => keys.map((key) => ({ type, key })));

function Stepper({ step, onPick }: { step: number; onPick: (n: number) => void }) {
  const { t } = useTranslation();
  return (
    <ol className="flex flex-1 items-center gap-2" aria-label={t('Steps')}>
      {STEPS.map((label, i) => (
        <li key={label} className="flex flex-1 items-center gap-2">
          <button type="button" disabled={i >= step} onClick={() => onPick(i)} aria-current={i === step ? 'step' : undefined} className="flex min-h-11 items-center gap-2 text-left">
            <span className={cx('flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold', i < step ? 'bg-success-text text-white' : i === step ? 'bg-primary text-white dark:text-slate-950' : 'bg-surface-muted text-text-muted')}>
              {i < step ? <Check className="size-4" aria-hidden /> : i + 1}
            </span>
            <span className={cx('hidden text-sm font-medium sm:inline', i === step ? 'text-text' : 'text-text-muted')}>{t(label)}</span>
          </button>
          {i < STEPS.length - 1 && <span aria-hidden className={cx('h-px flex-1', i < step ? 'bg-success-text' : 'bg-border')} />}
        </li>
      ))}
    </ol>
  );
}

function Footer({ onBack, busy, label, disabled }: { onBack?: () => void; busy: boolean; label: string; disabled?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-4">
      {onBack ? <Button variant="secondary" onClick={onBack}><ArrowLeft className="size-4" aria-hidden /> {t('Back')}</Button> : <span />}
      <Button type="submit" className="min-w-32" loading={busy} disabled={disabled}>{label}</Button>
    </div>
  );
}

interface PgForm {
  name: string;
  type: string;
  gstin: string;
  amenities: string[];
  address: PgAddress;
}

function PgStep({ form, setForm, onSave, busy, error }: { form: PgForm; setForm: (f: PgForm) => void; onSave: () => void; busy: boolean; error: Error | null }) {
  const { t } = useTranslation();
  const [problems, setProblems] = useState<Record<string, string>>({});

  function submit(e: FormEvent) {
    e.preventDefault();
    const { city, state } = form.address;
    const org = CreateOrgBody.safeParse({ name: form.name, type: form.type, city, state, ...(form.gstin && { gstin: form.gstin }) });
    const property = CreatePropertyBody.safeParse({ name: form.name, type: form.type, amenities: form.amenities, address: form.address });
    if (!org.success || !property.success) return setProblems(problemsOf([...(org.error?.issues ?? []), ...(property.error?.issues ?? [])]));
    setProblems({});
    onSave();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <Field label={t('PG name')} error={problems.name}><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label={t('Type')}>
          <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="boys">{t('Boys')}</option><option value="girls">{t('Girls')}</option><option value="coliving">{t('Co-living')}</option><option value="mixed">{t('Mixed')}</option>
          </Select>
        </Field>
        <Field label={t('GSTIN (optional)')} error={problems.gstin}><Input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })} /></Field>
      </div>
      <LocationPicker value={form.address} onChange={(address) => setForm({ ...form, address })} errors={problems} />
      <AmenityPicker value={form.amenities} onChange={(amenities) => setForm({ ...form, amenities })} />
      <FormError error={error} />
      <Footer busy={busy} label={t('Save and continue')} />
    </form>
  );
}

interface OwnerForm {
  name: string;
  email: string;
}

function OwnerStep({ form, setForm, docs, setDocs, orgId, phone, onBack, onSave, busy, error }: {
  form: OwnerForm; setForm: (f: OwnerForm) => void; docs: Docs; setDocs: (d: Docs) => void; orgId: string; phone?: string; onBack: () => void; onSave: () => void; busy: boolean; error: Error | null;
}) {
  const { t } = useTranslation();
  const ready = form.name.trim() && docs.owner_photo?.length && docs.owner_id?.length;
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(); }}>
      <div className="grid gap-4 md:grid-cols-[180px_1fr]">
        <MultiUpload label={t('Owner photo')} kind="photo" orgId={orgId} max={1} imagesOnly keys={docs.owner_photo ?? []} onChange={(owner_photo) => setDocs({ ...docs, owner_photo })} />
        <div className="grid content-start gap-3 sm:grid-cols-2">
          <Field label={t('Owner name')}><Input autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label={t('Mobile number')} hint={t('This is the number you log in with.')}><Input value={displayPhone(phone)} disabled /></Field>
          <div className="sm:col-span-2"><Field label={t('Email (optional)')} hint={t('We use this to tell you about your approval.')}><Input type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field></div>
        </div>
      </div>
      <div className="mt-4">
        <MultiUpload label={t('Owner ID proof')} hint={t('Aadhaar, PAN or passport. Add front and back.')} kind="kyc" orgId={orgId} max={6} keys={docs.owner_id ?? []} onChange={(owner_id) => setDocs({ ...docs, owner_id })} />
      </div>
      <FormError error={error} />
      <Footer onBack={onBack} busy={busy} label={t('Save and continue')} disabled={!ready} />
    </form>
  );
}

function DocumentsStep({ docs, setDocs, orgId, onBack, onSubmit, busy, error, resubmit }: {
  docs: Docs; setDocs: (d: Docs) => void; orgId: string; onBack: () => void; onSubmit: () => void; busy: boolean; error: Error | null; resubmit: boolean;
}) {
  const { t } = useTranslation();
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="space-y-4">
      <MultiUpload label={t('Property proof')} hint={t('Rent agreement, ownership deed or electricity bill.')} kind="kyc" orgId={orgId} max={6} keys={docs.property_proof ?? []} onChange={(property_proof) => setDocs({ ...docs, property_proof })} />
      <MultiUpload label={t('PG photos')} hint={t('Building, rooms and common areas.')} kind="photo" orgId={orgId} max={10} imagesOnly keys={docs.pg_photo ?? []} onChange={(pg_photo) => setDocs({ ...docs, pg_photo })} />
      <FormError error={error} />
      <Footer onBack={onBack} busy={busy} label={resubmit ? t('Send again for approval') : t('Submit for approval')} disabled={!docs.property_proof?.length} />
    </form>
  );
}

/** Admin comments stay visible on every step while the owner fixes things. */
function AdminComments({ org }: { org: any }) {
  const { t } = useTranslation();
  if (org?.kyc?.status !== 'rejected') return null;
  return (
    <div role="alert" className="mb-3 flex gap-3 rounded-md border border-warning bg-warning/10 p-3">
      <MessageSquareWarning className="size-5 shrink-0 text-warning-text" aria-hidden />
      <div>
        <p className="font-semibold">{t('Please fix this and send again')}</p>
        <p>{org.kyc.rejectionReason}</p>
      </div>
    </div>
  );
}

function Wizard({ org, property }: { org?: any; property?: any }) {
  const { t } = useTranslation();
  const { me, reload, setWorkspace } = useAuth();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [step, setStep] = useState(0);
  const [orgId, setOrgId] = useState<string | null>(org?._id ?? null);
  const [propertyId, setPropertyId] = useState<string | null>(property?._id ?? null);
  const { line1 = '', city = '', state = '', pincode = '', geo } = property?.address ?? EMPTY_ADDRESS;
  const [pg, setPg] = useState<PgForm>({
    name: org?.name ?? '',
    type: org?.type ?? 'coliving',
    gstin: org?.gstin ?? '',
    amenities: property?.amenities ?? [],
    address: { line1, city, state, pincode, ...(geo?.lat != null && { geo: { lat: geo.lat, lng: geo.lng } }) },
  });
  const [owner, setOwner] = useState<OwnerForm>({ name: me?.user.name ?? '', email: me?.user.email ?? '' });
  const [docs, setDocs] = useState<Docs>(docsFrom(org));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(err as Error);
    } finally {
      setBusy(false);
    }
  };

  const savePg = () =>
    run(async () => {
      const { city: pgCity, state: pgState } = pg.address;
      const orgBody = { name: pg.name, type: pg.type, city: pgCity, state: pgState, ...(pg.gstin && { gstin: pg.gstin }) };
      const propertyBody = { name: pg.name, type: pg.type, amenities: pg.amenities, address: pg.address };
      const id = orgId ?? (await api.post<{ _id: string }>('/orgs', orgBody))._id;
      if (orgId) await api.patch(`/org/${id}`, orgBody);
      setOrgId(id);
      if (propertyId) await api.patch(`/org/${id}/properties/${propertyId}`, propertyBody);
      else setPropertyId((await api.post<{ _id: string }>(`/org/${id}/properties`, { ...propertyBody, photos: [], houseRules: '' }))._id);
      const next = await reload();
      const membership = next?.memberships.find((m) => m.orgId === id);
      if (membership) setWorkspace(membership);
      setStep(1);
    });

  const saveOwner = () =>
    run(async () => {
      await api.patch('/auth/me', { name: owner.name, ...(owner.email && { email: owner.email }), avatarKey: docs.owner_photo?.[0] });
      await api.put(`/org/${orgId}/kyc`, { docs: docList(docs), submit: false });
      await reload();
      setStep(2);
    });

  const submit = () =>
    run(async () => {
      await api.put(`/org/${orgId}/kyc`, { docs: docList(docs), submit: true });
      await Promise.all([reload(), client.invalidateQueries()]); // the waiting page must not read the old status
      navigate('/app/dashboard');
    });

  const pick = (n: number) => {
    setError(null);
    setStep(n);
  };

  return (
    <>
      <div className="mb-3 flex items-center gap-4">
        <img src="/roomora-icon.svg" alt="Roomora" className="size-9 shrink-0" />
        <Stepper step={step} onPick={pick} />
      </div>
      <AdminComments org={org} />
      <Card className="p-4 md:p-5 lg:p-5">
        <h1 className="mb-3 text-lg font-bold">{t(STEPS[step])}</h1>
        {step === 0 && <PgStep form={pg} setForm={setPg} onSave={() => void savePg()} busy={busy} error={error} />}
        {step === 1 && orgId && <OwnerStep form={owner} setForm={setOwner} docs={docs} setDocs={setDocs} orgId={orgId} phone={me?.user.phone} onBack={() => pick(0)} onSave={() => void saveOwner()} busy={busy} error={error} />}
        {step === 2 && orgId && <DocumentsStep docs={docs} setDocs={setDocs} orgId={orgId} onBack={() => pick(1)} onSubmit={() => void submit()} busy={busy} error={error} resubmit={org?.kyc?.status === 'rejected'} />}
      </Card>
    </>
  );
}

const Page = ({ children }: { children: ReactNode }) => <main className="mx-auto max-w-5xl p-3 md:p-5">{children}</main>;

export default function OnboardingPage() {
  const { me, loading, workspace } = useAuth();
  // Fixed at first load: creating the org mid-wizard must not remount it and lose the form.
  const initial = useRef(workspace?.role === 'owner' ? workspace.orgId : null);
  const org = useGet<any>(initial.current ? `/org/${initial.current}` : null);
  const properties = useGet<any[]>(initial.current ? `/org/${initial.current}/properties` : null);
  if (loading) return <ListSkeleton />;
  if (!me) return <Navigate to="/login" replace />;
  if (workspace?.role === 'resident') return <Navigate to="/me" replace />;
  if (initial.current && (org.isPending || properties.isPending)) return <Page><ListSkeleton /></Page>;
  const submitted = org.data && (org.data.status !== 'pending' || org.data.kyc?.status === 'pending_review');
  if (submitted) return <Navigate to="/app/dashboard" replace />;
  return <Page><Wizard org={org.data} property={properties.data?.[0]} /></Page>;
}

/** Shown while the admin reviews. Anything else goes back to the editable wizard. */
export function PendingApprovalPage() {
  const { t } = useTranslation();
  const { orgPath, reload, signOut } = useAuth();
  const query = useGet<any>(orgPath(''));
  const [checking, setChecking] = useState(false);
  return (
    <main className="mx-auto max-w-lg space-y-3 p-4 pt-12">
      <Query query={query}>
        {(org) =>
          org.kyc?.status !== 'pending_review' ? <Navigate to="/onboarding" replace /> : (
            <>
              <Card className="text-center">
                <Clock className="mx-auto mb-2 size-10 text-warning-text" aria-hidden />
                <h1 className="text-xl font-bold">{t('Waiting for approval')}</h1>
                <p className="text-text-muted">{t('{{name}} is being reviewed. You can use Roomora once it is approved.', { name: org.name })}</p>
                {org.kyc.history?.at(-1) && <p className="mt-2 text-xs text-text-muted">{t('Submitted {{date}}', { date: formatDate(org.kyc.history.at(-1).at) })}</p>}
              </Card>
              <Button
                block
                loading={checking}
                onClick={async () => {
                  setChecking(true);
                  await Promise.all([reload(), query.refetch()]);
                  setChecking(false);
                }}
              >
                {t('Check status')}
              </Button>
              <Button variant="ghost" block onClick={() => void signOut()}>{t('Log out')}</Button>
            </>
          )
        }
      </Query>
    </main>
  );
}
