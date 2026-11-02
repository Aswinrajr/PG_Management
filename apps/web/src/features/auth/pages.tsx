import { ArrowLeft, ArrowRight, BedDouble, Building2, CheckCircle2, ChevronRight, KeyRound, Lock, Mail, ShieldCheck, Smartphone, Sparkles, UserRound, Users } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type InputHTMLAttributes, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { Button, cx, FormError } from '../../components/ui';
import { api } from '../../lib/api';
import { homeOf, useAuth, type Membership } from '../../lib/auth';

const RESEND_SEC = 30;

interface VerifyResult {
  accessToken: string;
  isNewUser: boolean;
}

/** A PG building whose windows light up one after another. */
function PgBuilding({ className }: { className?: string }) {
  const windows = [];
  for (let floor = 0; floor < 4; floor++) for (let col = 0; col < 4; col++) windows.push({ x: 46 + col * 44, y: 74 + floor * 46, delay: ((floor * 4 + col) * 0.37) % 4.8 });
  return (
    <svg viewBox="0 0 260 300" className={className} aria-hidden>
      <ellipse cx="130" cy="290" rx="120" ry="8" fill="rgb(15 23 42 / 0.3)" />
      <path d="M22 62 130 14l108 48z" fill="#fff" />
      <rect x="30" y="60" width="200" height="230" rx="6" fill="rgb(255 255 255 / 0.14)" stroke="rgb(255 255 255 / 0.85)" strokeWidth="2" />
      <rect x="104" y="26" width="52" height="22" rx="4" fill="#4f46e5" />
      <text x="130" y="42" textAnchor="middle" fill="#fff" fontSize="13" fontWeight="800" fontFamily="Poppins, Inter, sans-serif">PG</text>
      {windows.map((w) => <rect key={`${w.x}:${w.y}`} className="win" x={w.x} y={w.y} width="28" height="30" rx="4" style={{ animationDelay: `${w.delay}s` }} />)}
      <rect x="110" y="250" width="40" height="40" rx="6" fill="#fff" />
      <circle cx="141" cy="271" r="2.5" fill="#4f46e5" />
    </svg>
  );
}

function HeroCard({ icon: Icon, title, text, tone, className }: { icon: typeof BedDouble; title: string; text: string; tone: string; className?: string }) {
  return (
    <div className={cx('glass flex items-center gap-3 rounded-xl px-4 py-3 shadow-2xl', className)}>
      <span className={cx('flex size-10 shrink-0 items-center justify-center rounded-lg', tone)}><Icon className="size-5" aria-hidden /></span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-white/75">{text}</span>
      </span>
    </div>
  );
}

function Wordmark() {
  return (
    <Link to="/" className="inline-flex items-center gap-2 font-brand text-xl font-bold text-white">
      <img src="/roomora-icon.svg" alt="" className="size-9 rounded-lg" />
      <span>room<span className="text-indigo-200">ora</span></span>
    </Link>
  );
}

function OwnerHero() {
  const { t } = useTranslation();
  return (
    <>
      <div className="relative">
        <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium"><Sparkles className="size-3.5" aria-hidden /> {t('PG management, made simple')}</p>
        <h1 className="max-w-md font-brand text-4xl font-bold leading-tight tracking-tight">{t('Every bed, every rupee, every resident. One place.')}</h1>
        <p className="mt-3 max-w-md text-base text-white/80">{t('Run your PG without registers and spreadsheets. Rent, rooms, food and complaints, all on your phone.')}</p>
      </div>
      <div className="relative mx-auto w-full max-w-md">
        <PgBuilding className="float-slow mx-auto w-72" />
        <HeroCard icon={CheckCircle2} title="₹8,500 received" text={t('Room 204 · rent paid via UPI')} tone="bg-emerald-400/90 text-emerald-950" className="float absolute -left-6 top-6" />
        <HeroCard icon={BedDouble} title={t('92% occupied')} text={t('46 of 50 beds filled')} tone="bg-amber-300/90 text-amber-950" className="float-slow absolute -right-8 top-40" />
        <HeroCard icon={Users} title={t('New resident')} text={t('Bed 3B · moves in today')} tone="bg-indigo-200 text-indigo-900" className="float absolute -left-2 bottom-4" />
      </div>
      <ul className="relative flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/85">
        {[t('Bed map'), t('Rent & receipts'), t('Food menu'), t('Complaints')].map((x) => <li key={x} className="flex items-center gap-1.5"><CheckCircle2 className="size-4 text-emerald-300" aria-hidden /> {x}</li>)}
      </ul>
    </>
  );
}

function AdminHero() {
  const { t } = useTranslation();
  return (
    <>
      <div className="relative">
        <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium"><ShieldCheck className="size-3.5" aria-hidden /> {t('Restricted area')}</p>
        <h1 className="max-w-md font-brand text-4xl font-bold leading-tight tracking-tight">{t('Roomora platform console')}</h1>
        <p className="mt-3 max-w-md text-base text-white/70">{t('Approve PGs, review KYC, manage plans and send broadcasts. Every action is recorded in the audit log.')}</p>
      </div>
      <div className="relative mx-auto grid w-full max-w-sm place-items-center py-6">
        <div className="float-slow grid size-48 place-items-center rounded-[2.5rem] bg-white/5 ring-1 ring-white/15">
          <div className="grid size-32 place-items-center rounded-[2rem] bg-indigo-500/30 ring-1 ring-indigo-300/30">
            <ShieldCheck className="size-16 text-indigo-200" aria-hidden />
          </div>
        </div>
        <HeroCard icon={Building2} title={t('KYC queue')} text={t('Review new PGs')} tone="bg-indigo-200 text-indigo-900" className="float absolute -left-4 top-2" />
        <HeroCard icon={KeyRound} title={t('2-step login')} text={t('Password + authenticator')} tone="bg-emerald-300 text-emerald-950" className="float-slow absolute -right-4 bottom-2" />
      </div>
      <p className="relative text-sm text-white/60">{t('Not an admin? PG owners and residents log in with their phone number.')}</p>
    </>
  );
}

/** Split screen: animated hero on the left from lg, the form on the right. On phones the hero shrinks to a gradient header. */
function AuthLayout({ admin, children }: { admin?: boolean; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-background">
      <aside className={cx('relative hidden w-[52%] max-w-3xl flex-col justify-between gap-10 overflow-hidden p-12 text-white lg:flex', admin ? 'aurora-admin' : 'aurora')}>
        <div className="blob left-1/3 top-1/4 size-72 bg-indigo-400/30" aria-hidden />
        <div className="blob bottom-10 right-10 size-64 bg-teal-300/25" style={{ animationDelay: '-7s' }} aria-hidden />
        <div className="relative"><Wordmark /></div>
        {admin ? <AdminHero /> : <OwnerHero />}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className={cx('relative overflow-hidden px-5 pb-16 pt-6 text-white lg:hidden', admin ? 'aurora-admin' : 'aurora')}>
          <div className="blob -right-10 -top-10 size-40 bg-teal-300/30" aria-hidden />
          <div className="relative flex items-center justify-between">
            <Wordmark />
            {admin ? <ShieldCheck className="size-10 text-indigo-200" aria-hidden /> : <PgBuilding className="float-slow -mb-4 w-20" />}
          </div>
        </header>
        <main className="-mt-10 flex flex-1 items-start justify-center px-4 pb-10 lg:mt-0 lg:items-center lg:px-10">
          <div className="page-enter relative w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-overlay sm:p-8 lg:border-0 lg:bg-transparent lg:shadow-none">{children}</div>
        </main>
      </div>
    </div>
  );
}

/** Input with a leading icon, used across the auth screens. */
function IconInput({ icon: Icon, prefix, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { icon: typeof Mail; prefix?: string }) {
  return (
    <div className={cx('flex min-h-12 items-center gap-2 rounded-xl border border-border bg-surface px-3 transition focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15', className)}>
      <Icon className="size-5 shrink-0 text-text-muted" aria-hidden />
      {prefix && <span className="border-r border-border pr-2 text-base font-medium">{prefix}</span>}
      <input className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-text-muted/70 focus-visible:outline-none" {...rest} />
    </div>
  );
}

/** Six boxes over one real input, so paste and SMS autofill keep working. */
function OtpInput({ value, onChange, inputRef, invalid }: { value: string; onChange: (v: string) => void; inputRef: RefObject<HTMLInputElement | null>; invalid?: boolean }) {
  const { t } = useTranslation();
  const [focused, setFocused] = useState(false);
  return (
    <div className={cx('relative', invalid && 'shake')}>
      <input
        ref={inputRef}
        aria-label={t('6-digit code')}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={value}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        className="absolute inset-0 z-10 w-full cursor-text opacity-0"
      />
      <div className="grid grid-cols-6 gap-2" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => {
          const digit = value[i];
          const active = focused && i === Math.min(value.length, 5);
          return (
            <div
              key={i}
              className={cx(
                'tabular flex aspect-[4/5] items-center justify-center rounded-xl border-2 bg-surface text-2xl font-bold transition-all',
                invalid ? 'border-danger-text/60' : active ? 'border-primary ring-4 ring-primary/15' : digit ? 'border-primary/40' : 'border-border',
                active && !digit && 'otp-caret',
              )}
            >
              {digit && <span className="pop">{digit}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Steps({ current }: { current: number }) {
  const { t } = useTranslation();
  const steps = [t('Phone'), t('Verify'), t('PG details')];
  return (
    <ol className="mb-6 flex items-center gap-2 text-xs font-medium">
      {steps.map((label, i) => (
        <li key={label} className={cx('flex items-center gap-2', i < steps.length - 1 && 'flex-1')}>
          <span className={cx('flex size-6 shrink-0 items-center justify-center rounded-full transition-colors', i < current ? 'bg-success text-white' : i === current ? 'bg-primary text-white dark:text-slate-950' : 'bg-surface-muted text-text-muted')}>
            {i < current ? <CheckCircle2 className="size-4" aria-hidden /> : i + 1}
          </span>
          <span className={cx('hidden sm:inline', i === current ? 'text-text' : 'text-text-muted')}>{label}</span>
          {i < steps.length - 1 && <span className={cx('h-0.5 flex-1 rounded-full transition-colors', i < current ? 'bg-success' : 'bg-border')} />}
        </li>
      ))}
    </ol>
  );
}

const bigButton = 'min-h-12 rounded-xl text-base shadow-lg shadow-primary/25';

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

  const prettyPhone = phone.length === 10 ? `${phone.slice(0, 5)} ${phone.slice(5)}` : phone;

  return (
    <AuthLayout>
      {register && <Steps current={step === 'phone' ? 0 : 1} />}
      {step === 'phone' ? (
        <div key="phone" className="step-in">
          <h2 className="font-brand text-3xl font-bold tracking-tight">{register ? t('Register your PG') : t('Welcome back')}</h2>
          <p className="mt-1.5 text-text-muted">
            {register ? t('Start with your mobile number. Next you add your business details and documents for approval.') : t('Log in with your mobile number. We will send you a 6-digit code.')}
          </p>
          <form onSubmit={send} className="mt-6 space-y-4">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">{t('Mobile number')}</span>
              <IconInput icon={Smartphone} prefix="+91" autoFocus inputMode="numeric" maxLength={10} autoComplete="tel-national" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} placeholder="98765 43210" />
            </label>
            <FormError error={error} />
            <Button type="submit" block loading={busy} disabled={phone.length !== 10} className={bigButton}>
              {t('Get OTP')} <ArrowRight className="size-4" aria-hidden />
            </Button>
          </form>
        </div>
      ) : (
        <div key="otp" className="step-in">
          <button type="button" onClick={() => { setStep('phone'); setCode(''); setError(null); }} className="mb-4 inline-flex min-h-9 items-center gap-1 text-sm font-medium text-text-muted hover:text-text">
            <ArrowLeft className="size-4" aria-hidden /> {t('Change number')}
          </button>
          <h2 className="font-brand text-3xl font-bold tracking-tight">{t('Enter OTP')}</h2>
          <p className="mt-1.5 text-text-muted">{t('Sent to')} <span className="font-semibold text-text">+91 {prettyPhone}</span></p>
          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void verify();
            }}
          >
            <OtpInput
              inputRef={otpRef}
              value={code}
              invalid={Boolean(error) && !busy}
              onChange={(value) => {
                setCode(value);
                if (error) setError(null);
                if (value.length === 6 && (!needsConsent || consent)) void verify(value);
              }}
            />
            {needsConsent && (
              <label className="flex items-start gap-3 rounded-xl border border-border bg-surface-muted/60 p-3 text-sm">
                <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                {t('I agree to the privacy policy and to Roomora storing my details to run this service.')}
              </label>
            )}
            <FormError error={error} />
            <Button type="submit" block loading={busy} disabled={code.length !== 6 || (needsConsent && !consent)} className={bigButton}>
              {t('Verify and continue')}
            </Button>
            <p className="text-center text-sm text-text-muted">
              {t('Did not get it?')}{' '}
              <button type="button" disabled={wait > 0} onClick={() => void send()} className="min-h-9 font-semibold text-primary disabled:font-medium disabled:text-text-muted">
                {wait > 0 ? t('Resend in 0:{{sec}}', { sec: String(wait).padStart(2, '0') }) : t('Resend OTP')}
              </button>
            </p>
          </form>
        </div>
      )}

      <div className="mt-8 space-y-3">
        <div className="flex items-center gap-3 text-xs text-text-muted"><span className="h-px flex-1 bg-border" />{register ? t('Already registered?') : t('New here?')}<span className="h-px flex-1 bg-border" /></div>
        <Link to={register ? '/login' : '/register'} className="group flex min-h-12 items-center gap-3 rounded-xl border border-border p-3 transition hover:border-primary hover:bg-primary-soft">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary-soft text-primary"><Building2 className="size-5" aria-hidden /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{register ? t('Log in to your account') : t('Register your PG')}</span>
            <span className="block text-xs text-text-muted">{register ? t('Owners and residents use the same login') : t('Free trial, set up in minutes')}</span>
          </span>
          <ChevronRight className="size-5 text-text-muted transition group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
        </Link>
        {!register && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted">
            <span className="inline-flex items-center gap-1.5"><UserRound className="size-3.5" aria-hidden /> {t('Residents: your PG adds you first, then log in with that number.')}</span>
            <Link to="/admin/login" className="inline-flex min-h-9 items-center gap-1 font-medium hover:text-primary"><ShieldCheck className="size-3.5" aria-hidden /> {t('Admin login')}</Link>
          </div>
        )}
      </div>
    </AuthLayout>
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
    <AuthLayout>
      <h1 className="font-brand text-3xl font-bold tracking-tight">{t('Choose a workspace')}</h1>
      <p className="mt-1.5 text-text-muted">{t('You belong to more than one PG. Pick where to go.')}</p>
      <div className="stagger mt-6 space-y-3">
        {me?.memberships.map((m) => (
          <button key={`${m.orgId}:${m.role}`} type="button" onClick={() => pick(m)} className="group flex w-full items-center gap-3 rounded-xl border border-border bg-surface p-4 text-left transition hover:-translate-y-0.5 hover:border-primary hover:shadow-overlay">
            <span className={cx('flex size-11 items-center justify-center rounded-xl', m.role === 'owner' ? 'bg-primary-soft text-primary' : 'bg-secondary/15 text-secondary-text')}>
              {m.role === 'owner' ? <Building2 className="size-5" aria-hidden /> : <BedDouble className="size-5" aria-hidden />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{m.orgName}</span>
              <span className="block text-sm capitalize text-text-muted">{t(m.role)}</span>
            </span>
            <ChevronRight className="size-5 text-text-muted transition group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
          </button>
        ))}
      </div>
    </AuthLayout>
  );
}

export function InvitePage() {
  const { t } = useTranslation();
  const { code } = useParams();
  const { me, loading, reload, setWorkspace } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);
  if (loading) return null;
  if (!me) return <Navigate to="/login" replace state={{ next: `/invite/${code}` }} />;

  async function accept() {
    setBusy(true);
    try {
      const { orgId } = await api.post<{ orgId: string }>(`/invites/${code}/accept`);
      const next = await reload();
      const membership = next?.memberships.find((m) => m.orgId === orgId);
      if (membership) setWorkspace(membership);
      navigate(homeOf(membership));
    } catch (err) {
      setError(err as Error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary"><Mail className="size-7" aria-hidden /></span>
      <h1 className="font-brand text-3xl font-bold tracking-tight">{t('You have been invited')}</h1>
      <p className="mt-1.5 text-text-muted">{t('Accept to see your room, rent and notices.')}</p>
      <div className="mt-6 space-y-3">
        <FormError error={error} />
        <Button block loading={busy} className={bigButton} onClick={accept}>{t('Accept invite')} <ArrowRight className="size-4" aria-hidden /></Button>
      </div>
    </AuthLayout>
  );
}

export function AdminLoginPage() {
  const { t } = useTranslation();
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '', totp: '' });
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);
  const update = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: key === 'totp' ? e.target.value.replace(/\D/g, '') : e.target.value });

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
    <AuthLayout admin>
      <span className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-slate-900 text-indigo-200 dark:bg-indigo-500/20"><ShieldCheck className="size-6" aria-hidden /></span>
      <h1 className="font-brand text-3xl font-bold tracking-tight">{t('Admin login')}</h1>
      <p className="mt-1.5 text-text-muted">{t('Use your admin email, password and the code from your authenticator app.')}</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{t('Email')}</span>
          <IconInput icon={Mail} type="email" autoComplete="username" placeholder="admin@roomora.in" value={form.email} onChange={update('email')} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{t('Password')}</span>
          <IconInput icon={Lock} type="password" autoComplete="current-password" placeholder="••••••••••••" value={form.password} onChange={update('password')} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{t('Authenticator code')}</span>
          <IconInput icon={KeyRound} inputMode="numeric" maxLength={6} autoComplete="one-time-code" placeholder="123456" className="tabular" value={form.totp} onChange={update('totp')} />
        </label>
        <FormError error={error} />
        <Button type="submit" block loading={busy} disabled={!form.email || !form.password || form.totp.length !== 6} className={bigButton}>
          {t('Log in securely')} <ArrowRight className="size-4" aria-hidden />
        </Button>
      </form>
      <Link to="/login" className="mt-6 inline-flex min-h-9 items-center gap-1 text-sm font-medium text-text-muted hover:text-primary">
        <ArrowLeft className="size-4" aria-hidden /> {t('Owner or resident? Log in with your phone')}
      </Link>
    </AuthLayout>
  );
}
