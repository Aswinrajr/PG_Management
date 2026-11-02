import { ArrowLeft, Home, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { Button } from './ui';

/** A corridor door marked 404, ajar, with a "Vacant" tag swinging on the handle. */
function VacantRoom({ number }: { number: string }) {
  return (
    <svg viewBox="0 0 260 240" className="mx-auto w-64 max-w-full sm:w-72" aria-hidden>
      <defs>
        <linearGradient id="nf-wall" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--color-primary-soft)" />
          <stop offset="1" stopColor="var(--color-surface)" />
        </linearGradient>
        <linearGradient id="nf-door" x1="0" x2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#4338ca" />
        </linearGradient>
      </defs>
      <ellipse cx="130" cy="222" rx="110" ry="10" fill="var(--color-border)" />
      <rect x="40" y="20" width="180" height="200" rx="16" fill="url(#nf-wall)" stroke="var(--color-border)" strokeWidth="2" />
      {/* doorway, dark room behind with a bed */}
      <rect x="78" y="58" width="104" height="162" rx="6" fill="#1e1b4b" />
      <rect x="92" y="176" width="76" height="22" rx="5" fill="#312e81" />
      <rect x="92" y="166" width="22" height="14" rx="4" fill="#4f46e5" />
      <rect x="90" y="196" width="6" height="16" rx="2" fill="#312e81" />
      <rect x="164" y="196" width="6" height="16" rx="2" fill="#312e81" />
      <g className="zzz" style={{ animationDelay: '0s' }}><text x="140" y="160" fill="#a5b4fc" fontSize="14" fontWeight="700">z</text></g>
      <g className="zzz" style={{ animationDelay: '1s' }}><text x="150" y="150" fill="#a5b4fc" fontSize="18" fontWeight="700">z</text></g>
      <g className="zzz" style={{ animationDelay: '2s' }}><text x="160" y="138" fill="#a5b4fc" fontSize="22" fontWeight="700">Z</text></g>
      {/* door */}
      <g className="door" style={{ transformBox: 'fill-box' }}>
        <rect x="78" y="58" width="104" height="162" rx="6" fill="url(#nf-door)" />
        <rect x="92" y="74" width="76" height="56" rx="5" fill="none" stroke="rgb(255 255 255 / 0.25)" strokeWidth="2" />
        <rect x="92" y="142" width="76" height="62" rx="5" fill="none" stroke="rgb(255 255 255 / 0.25)" strokeWidth="2" />
        <rect x="106" y="86" width="48" height="26" rx="6" fill="#fff" />
        <text x="130" y="105" textAnchor="middle" fill="#4338ca" fontSize="17" fontWeight="800" fontFamily="Poppins, Inter, sans-serif">{number}</text>
        <circle cx="166" cy="142" r="5" fill="#fbbf24" />
        <g className="swing" style={{ transformBox: 'view-box', transformOrigin: '166px 142px' }}>
          <line x1="166" y1="142" x2="166" y2="152" stroke="#fbbf24" strokeWidth="2" />
          <rect x="140" y="152" width="52" height="22" rx="4" fill="#fbbf24" />
          <text x="166" y="167" textAnchor="middle" fill="#78350f" fontSize="9" fontWeight="800" letterSpacing="0.5">VACANT</text>
        </g>
      </g>
      {/* corridor lamp */}
      <circle cx="130" cy="38" r="6" fill="#fde68a" />
      <circle cx="130" cy="38" r="14" fill="#fde68a" opacity="0.25" />
    </svg>
  );
}

function Screen({ code, title, text, children }: { code: string; title: string; text: string; children: React.ReactNode }) {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-background p-6">
      <div className="blob -left-24 -top-24 size-80 bg-primary/20" aria-hidden />
      <div className="blob -bottom-24 -right-24 size-80 bg-secondary/20" style={{ animationDelay: '-6s' }} aria-hidden />
      <div className="stagger relative w-full max-w-md text-center">
        <VacantRoom number={code} />
        <div>
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">{code === '404' ? 'Room 404' : 'Error'}</p>
          <h1 className="mt-2 font-brand text-3xl font-bold tracking-tight">{title}</h1>
          <p className="mx-auto mt-2 max-w-sm text-text-muted">{text}</p>
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-2">{children}</div>
      </div>
    </main>
  );
}

export function NotFound() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <Screen code="404" title={t('This room is vacant')} text={t('The page you are looking for has checked out, or it never checked in. Let us take you back to your PG.')}>
      <Link to="/"><Button><Home className="size-4" aria-hidden /> {t('Go home')}</Button></Link>
      <Button variant="secondary" onClick={() => navigate(-1)}><ArrowLeft className="size-4" aria-hidden /> {t('Go back')}</Button>
    </Screen>
  );
}

export function CrashScreen({ error }: { error?: Error }) {
  const { t } = useTranslation();
  return (
    <Screen code="500" title={t('The fuse tripped')} text={error?.message && !/import|chunk/i.test(error.message) ? error.message : t('Something went wrong on this page. Reloading usually fixes it.')}>
      <Button onClick={() => location.reload()}><RotateCcw className="size-4" aria-hidden /> {t('Reload')}</Button>
      <a href="/"><Button variant="secondary"><Home className="size-4" aria-hidden /> {t('Go home')}</Button></a>
    </Screen>
  );
}
