import { Building2, CreditCard, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { Button, Card, Field, FormError, Input } from '../../components/ui';
import { api } from '../../lib/api';
import { homeOf, useAuth, type Membership } from '../../lib/auth';

const RESEND_SEC = 30;

interface VerifyResult {
  accessToken: string;
  isNewUser: boolean;
}

function BrandPanel() {
  const { t } = useTranslation();
  const benefits = [
    { icon: Building2, text: t('Every bed, room and floor in one view') },
    { icon: CreditCard, text: t('Collect rent and share receipts in seconds') },
    { icon: ShieldCheck, text: t('Your data stays private to your PG') },
  ];
  return (
    <aside className="hidden flex-1 flex-col justify-center gap-8 bg-linear-to-br from-primary to-primary-hover p-12 text-white lg:flex dark:text-slate-950">
      <img src="/roomora-logo.svg" alt="Roomora" className="w-60 rounded-lg bg-white p-3" />
      <h1 className="text-[32px] font-bold leading-10">{t('Run your PG without registers and spreadsheets')}</h1>
      <ul className="space-y-4 text-base">
        {benefits.map(({ icon: Icon, text }) => <li key={text} className="flex items-center gap-3"><Icon className="size-5" aria-hidden /> {text}</li>)}
      </ul>
    </aside>
  );
}

export function LoginPage({ register = false }: { register?: boolean }) {
  const { t } = useTranslation();
  const { me, workspace, signIn, setWorkspace } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [consent, setConsent] = useState(false);
  const [needsConsent, setNeedsConsent] = useState(register);
  const [wait, setWait] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);
  const otpRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  useEffect(() => {
    if (step === 'otp') otpRef.current?.focus();
  }, [step]);

  if (me) return <Navigate to={me.isSuperAdmin ? '/admin' : me.memberships.length > 1 ? '/select-workspace' : homeOf(workspace)} replace />;

  async function send(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/otp/send', { phone });
      setStep('otp');
      setWait(RESEND_SEC);
    } catch (err) {
      setError(err as Error);
    } finally {
      setBusy(false);
    }
  }

  async function verify(value = code) {
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<VerifyResult>('/auth/otp/verify', { phone, code: value, consent });
      const next = await signIn(result.accessToken);
      if (!next?.memberships.length) return navigate(next?.isSuperAdmin ? '/admin' : '/onboarding');
      if (next.memberships.length === 1) {
        setWorkspace(next.memberships[0]);
        return navigate(homeOf(next.memberships[0]));
      }
      navigate('/select-workspace');
    } catch (err) {
      const apiError = err as Error & { details?: { consentRequired?: boolean } };
      if (apiError.details?.consentRequired) setNeedsConsent(true);
      setError(apiError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh">
      <BrandPanel />
      <main className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-4">
          <img src="/roomora-logo.svg" alt="Roomora" className="mx-auto w-44 lg:hidden dark:rounded-md dark:bg-white dark:p-1" />
          <div>
            <h2 className="text-2xl font-bold">{step !== 'phone' ? t('Enter OTP') : register ? t('Register your PG') : t('Log in')}</h2>
            <p className="text-text-muted">{step === 'phone' ? (register ? t('Start with your mobile number. Next you add your business details and documents for approval.') : t('We will send a 6-digit code to your phone.')) : t('Sent to +91 {{phone}}', { phone })}</p>
          </div>
          {step === 'phone' ? (
            <form onSubmit={send} className="space-y-3">
              <Field label={t('Mobile number')}>
                <div className="flex gap-2">
                  <span className="flex min-h-11 items-center rounded-sm border border-border bg-surface-muted px-3 text-sm">+91</span>
                  <Input autoFocus inputMode="numeric" maxLength={10} autoComplete="tel-national" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} placeholder="98765 43210" />
                </div>
              </Field>
              <FormError error={error} />
              <Button type="submit" block loading={busy} disabled={phone.length !== 10}>{t('Get OTP')}</Button>
            </form>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void verify();
              }}
            >
              <Field label={t('6-digit code')}>
                <Input
                  ref={otpRef}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  className="tabular text-center text-xl tracking-[0.5em]"
                  value={code}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '');
                    setCode(value);
                    if (value.length === 6 && (!needsConsent || consent)) void verify(value);
                  }}
                />
              </Field>
              {needsConsent && (
                <label className="flex min-h-11 items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1 size-4" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                  {t('I agree to the privacy policy and to Roomora storing my details to run this service.')}
                </label>
              )}
              <FormError error={error} />
              <Button type="submit" block loading={busy} disabled={code.length !== 6 || (needsConsent && !consent)}>{t('Verify')}</Button>
              <div className="flex items-center justify-between">
                <Button variant="ghost" onClick={() => { setStep('phone'); setCode(''); setError(null); }}>{t('Change number')}</Button>
                <Button variant="ghost" disabled={wait > 0} onClick={() => void send()}>{wait > 0 ? t('Resend in 0:{{sec}}', { sec: String(wait).padStart(2, '0') }) : t('Resend OTP')}</Button>
              </div>
            </form>
          )}
          <p className="text-center text-sm text-text-muted">
            {register ? t('Already registered?') : t('New PG owner?')}{' '}
            <Link to={register ? '/login' : '/register'} className="inline-flex min-h-11 items-center font-medium text-primary">{register ? t('Log in') : t('Register your PG')}</Link>
          </p>
          {!register && <p className="text-center text-xs text-text-muted">{t('Residents: your PG adds you first, then log in with that number.')}</p>}
        </div>
      </main>
    </div>
  );
}

export function SelectWorkspacePage() {
  const { t } = useTranslation();
  const { me, loading, setWorkspace } = useAuth();
  const navigate = useNavigate();
  if (!loading && !me) return <Navigate to="/login" replace />;
  const pick = (m: Membership) => {
    setWorkspace(m);
    navigate(homeOf(m));
  };
  return (
    <main className="mx-auto max-w-lg space-y-4 p-4 pt-12">
      <h1 className="text-2xl font-bold">{t('Choose a workspace')}</h1>
      {me?.memberships.map((m) => (
        <button key={`${m.orgId}:${m.role}`} type="button" onClick={() => pick(m)} className="block w-full rounded-md border border-border bg-surface p-4 text-left hover:border-primary">
          <p className="font-semibold">{m.orgName}</p>
          <p className="capitalize text-text-muted">{t(m.role)}</p>
        </button>
      ))}
    </main>
  );
}

export function InvitePage() {
  const { t } = useTranslation();
  const { code } = useParams();
  const { me, loading, reload, setWorkspace } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<Error | null>(null);
  if (loading) return null;
  if (!me) return <Navigate to="/login" replace state={{ next: `/invite/${code}` }} />;

  async function accept() {
    try {
      const { orgId } = await api.post<{ orgId: string }>(`/invites/${code}/accept`);
      const next = await reload();
      const membership = next?.memberships.find((m) => m.orgId === orgId);
      if (membership) setWorkspace(membership);
      navigate(homeOf(membership));
    } catch (err) {
      setError(err as Error);
    }
  }

  return (
    <main className="mx-auto max-w-md p-4 pt-12">
      <Card>
        <h1 className="mb-2 text-xl font-bold">{t('You have been invited')}</h1>
        <p className="mb-4 text-text-muted">{t('Accept to see your room, rent and notices.')}</p>
        <FormError error={error} />
        <Button block className="mt-3" onClick={accept}>{t('Accept invite')}</Button>
      </Card>
    </main>
  );
}

export function AdminLoginPage() {
  const { t } = useTranslation();
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '', totp: '' });
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);
  const update = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { accessToken } = await api.post<{ accessToken: string }>('/auth/admin/login', form);
      await signIn(accessToken);
      navigate('/admin');
    } catch (err) {
      setError(err as Error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-sm space-y-4 p-4 pt-16">
      <h1 className="text-2xl font-bold">{t('Admin login')}</h1>
      <form onSubmit={submit} className="space-y-3">
        <Field label={t('Email')}><Input type="email" autoComplete="username" value={form.email} onChange={update('email')} /></Field>
        <Field label={t('Password')}><Input type="password" autoComplete="current-password" value={form.password} onChange={update('password')} /></Field>
        <Field label={t('Authenticator code')}><Input inputMode="numeric" maxLength={6} autoComplete="one-time-code" value={form.totp} onChange={update('totp')} /></Field>
        <FormError error={error} />
        <Button type="submit" block loading={busy}>{t('Log in')}</Button>
      </form>
    </main>
  );
}
