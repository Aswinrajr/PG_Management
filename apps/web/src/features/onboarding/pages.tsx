import { CreateOrgBody } from '@roomora/types';
import { CheckCircle2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router';
import { Button, Card, Field, FileUpload, FormError, Input, PageHeader, Select } from '../../components/ui';
import { useGet, useSend } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { PropertyForm, RentRulesForm, RoomsGrid } from '../properties/pages';

const STEPS = ['Your business', 'First property', 'Rooms', 'Rent rules', 'KYC', 'Done'];

function BusinessStep({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const { reload, setWorkspace } = useAuth();
  const [form, setForm] = useState({ name: '', type: 'coliving', city: '', state: '', gstin: '' });
  const [problems, setProblems] = useState<Record<string, string>>({});
  const save = useSend('post', '/orgs');
  const bind = (key: keyof typeof form) => ({ value: form[key], onChange: (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value }) });

  function submit(e: FormEvent) {
    e.preventDefault();
    const { gstin, ...rest } = form;
    const parsed = CreateOrgBody.safeParse({ ...rest, ...(gstin && { gstin }) });
    if (!parsed.success) {
      setProblems(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setProblems({});
    save.mutate(parsed.data, {
      onSuccess: async (org) => {
        const me = await reload();
        const membership = me?.memberships.find((m) => m.orgId === org._id);
        if (membership) setWorkspace(membership);
        onDone();
      },
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label={t('Business name')} error={problems.name}><Input {...bind('name')} /></Field>
      <Field label={t('Type')}>
        <Select {...bind('type')}>
          <option value="boys">{t('Boys')}</option><option value="girls">{t('Girls')}</option><option value="coliving">{t('Co-living')}</option><option value="mixed">{t('Mixed')}</option>
        </Select>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('City')} error={problems.city}><Input {...bind('city')} /></Field>
        <Field label={t('State')} error={problems.state}><Input {...bind('state')} /></Field>
      </div>
      <Field label={t('GSTIN (optional)')} error={problems.gstin}><Input {...bind('gstin')} /></Field>
      <FormError error={save.error} />
      <Button type="submit" block loading={save.isPending}>{t('Next')}</Button>
    </form>
  );
}

function RulesStep({ propertyId, onDone }: { propertyId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const { orgPath } = useAuth();
  const property = useGet<any>(orgPath(`/properties/${propertyId}`));
  if (!property.data) return <p className="text-text-muted">{t('Loading…')}</p>;
  return (
    <>
      <RentRulesForm propertyId={propertyId} rules={property.data.rentRules} />
      <Button variant="secondary" block className="mt-3" onClick={onDone}>{t('Next')}</Button>
    </>
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
      <Button variant="ghost" block onClick={onDone}>{t('Skip for now')}</Button>
    </div>
  );
}

export default function OnboardingPage() {
  const { t } = useTranslation();
  const { me, loading, workspace } = useAuth();
  const [step, setStep] = useState(0);
  const [propertyId, setPropertyId] = useState('');
  if (loading) return null;
  if (!me) return <Navigate to="/login" replace />;
  const next = () => setStep(step + 1);
  return (
    <main className="mx-auto max-w-[720px] p-4 md:p-8">
      <img src="/roomora-logo.svg" alt="Roomora" className="mb-4 w-36" />
      <PageHeader title={t(STEPS[step])} subtitle={t('Step {{n}} of {{total}}', { n: step + 1, total: STEPS.length })} />
      <div className="mb-4 h-2 rounded-full bg-surface-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>
      <Card>
        {step === 0 && <BusinessStep onDone={next} />}
        {step === 1 && <PropertyForm onDone={(id) => { setPropertyId(id); next(); }} />}
        {step === 2 && <><RoomsGrid propertyId={propertyId} onDone={next} /><Button variant="ghost" block className="mt-3" onClick={next}>{t('Skip for now')}</Button></>}
        {step === 3 && <RulesStep propertyId={propertyId} onDone={next} />}
        {step === 4 && <KycStep onDone={next} />}
        {step === 5 && (
          <div className="py-6 text-center">
            <CheckCircle2 className="mx-auto mb-2 size-12 text-success-text" aria-hidden />
            <p className="mb-4 text-xl font-bold">{t('{{name}} is ready', { name: workspace?.orgName })}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Link to="/app/residents/new"><Button block>{t('Add first resident')}</Button></Link>
              <Link to="/app/dashboard"><Button variant="secondary" block>{t('Go to dashboard')}</Button></Link>
            </div>
          </div>
        )}
      </Card>
    </main>
  );
}
