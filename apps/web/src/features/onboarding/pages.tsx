import { CreateOrgBody, CreatePropertyBody } from '@roomora/types';
import { Clock, XCircle } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router';
import { Button, Card, Field, FileUpload, FormError, Input, PageHeader, Query, Select } from '../../components/ui';
import { api, useGet, useSend } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { KycCard } from '../ops/pages';
import { EMPTY_ADDRESS, LocationPicker } from '../properties/location';
import { AmenityPicker, problemsOf } from '../properties/pages';

const STEPS = ['Your PG', 'Documents', 'Submitted'];

function PgStep({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const { reload, setWorkspace } = useAuth();
  const [name, setName] = useState('');
  const [type, setType] = useState('coliving');
  const [gstin, setGstin] = useState('');
  const [amenities, setAmenities] = useState<string[]>([]);
  const [address, setAddress] = useState(EMPTY_ADDRESS);
  const [orgId, setOrgId] = useState<string | null>(null); // a failed second call must not create a second org
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const org = CreateOrgBody.safeParse({ name, type, city: address.city, state: address.state, ...(gstin && { gstin }) });
    const property = CreatePropertyBody.safeParse({ name, type, amenities, address });
    if (!org.success || !property.success) {
      return setProblems(problemsOf([...(org.error?.issues ?? []), ...(property.error?.issues ?? [])]));
    }
    setProblems({});
    setError(null);
    setBusy(true);
    try {
      const id = orgId ?? (await api.post<{ _id: string }>('/orgs', org.data))._id;
      setOrgId(id);
      await api.post(`/org/${id}/properties`, property.data);
      const me = await reload();
      const membership = me?.memberships.find((m) => m.orgId === id);
      if (membership) setWorkspace(membership);
      onDone();
    } catch (err) {
      setError(err as Error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label={t('PG name')} error={problems.name}><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label={t('Type')}>
        <Select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="boys">{t('Boys')}</option><option value="girls">{t('Girls')}</option><option value="coliving">{t('Co-living')}</option><option value="mixed">{t('Mixed')}</option>
        </Select>
      </Field>
      <LocationPicker value={address} onChange={setAddress} errors={problems} />
      <AmenityPicker value={amenities} onChange={setAmenities} />
      <Field label={t('GSTIN (optional)')} error={problems.gstin}><Input value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} /></Field>
      <FormError error={error} />
      <Button type="submit" block loading={busy}>{t('Next')}</Button>
    </form>
  );
}

function KycStep({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const { orgPath, workspace } = useAuth();
  const [ownerId, setOwnerId] = useState('');
  const [proof, setProof] = useState('');
  const save = useSend('put', orgPath('/kyc'));
  return (
    <div className="space-y-3">
      <FileUpload label={t('Owner ID proof')} kind="kyc" orgId={workspace!.orgId} value={ownerId} onChange={setOwnerId} />
      <FileUpload label={t('Property proof')} kind="kyc" orgId={workspace!.orgId} value={proof} onChange={setProof} />
      <FormError error={save.error} />
      <Button block disabled={!ownerId || !proof} loading={save.isPending} onClick={() => save.mutate({ docs: [{ type: 'owner_id', key: ownerId }, { type: 'property_proof', key: proof }] }, { onSuccess: onDone })}>{t('Submit')}</Button>
    </div>
  );
}

export default function OnboardingPage() {
  const { t } = useTranslation();
  const { me, loading } = useAuth();
  const [step, setStep] = useState(0);
  if (loading) return null;
  if (!me) return <Navigate to="/login" replace />;
  const next = () => setStep(step + 1);
  return (
    <main className="mx-auto max-w-[720px] p-4 md:p-8">
      <img src="/roomora-logo.svg" alt="Roomora" className="mb-4 w-36 dark:rounded-md dark:bg-white dark:p-1" />
      <PageHeader title={t(STEPS[step])} subtitle={t('Step {{n}} of {{total}}', { n: step + 1, total: STEPS.length })} />
      <div className="mb-4 h-2 rounded-full bg-surface-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>
      <Card>
        {step === 0 && <PgStep onDone={next} />}
        {step === 1 && <KycStep onDone={next} />}
        {step === 2 && (
          <div className="py-6 text-center">
            <Clock className="mx-auto mb-2 size-12 text-warning-text" aria-hidden />
            <p className="mb-1 text-xl font-bold">{t('Sent for approval')}</p>
            <p className="mb-4 text-text-muted">{t('We will review your details. You can set up rooms once approved.')}</p>
            <Link to="/app/dashboard"><Button block>{t('Continue')}</Button></Link>
          </div>
        )}
      </Card>
    </main>
  );
}

/** Everything an unapproved owner can see. */
export function PendingApprovalPage() {
  const { t } = useTranslation();
  const { orgPath, reload, signOut } = useAuth();
  const query = useGet<any>(orgPath(''));
  const [checking, setChecking] = useState(false);
  return (
    <main className="mx-auto max-w-lg space-y-4 p-4 pt-12">
      <img src="/roomora-logo.svg" alt="Roomora" className="w-36 dark:rounded-md dark:bg-white dark:p-1" />
      <Query query={query}>
        {(org) => {
          const rejected = org.kyc?.status === 'rejected';
          const waiting = org.kyc?.status === 'pending_review';
          return (
            <>
              <Card className="text-center">
                {rejected ? <XCircle className="mx-auto mb-2 size-10 text-danger-text" aria-hidden /> : <Clock className="mx-auto mb-2 size-10 text-warning-text" aria-hidden />}
                <h1 className="text-xl font-bold">{rejected ? t('Your documents need attention') : waiting ? t('Waiting for approval') : t('Upload your documents')}</h1>
                <p className="text-text-muted">{rejected ? org.kyc.rejectionReason : waiting ? t('{{name}} is being reviewed. You can use Roomora once it is approved.', { name: org.name }) : t('We need these before we can approve {{name}}.', { name: org.name })}</p>
              </Card>
              {!waiting && <KycCard org={org} />}
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
          );
        }}
      </Query>
    </main>
  );
}
