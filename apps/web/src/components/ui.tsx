import * as Dialog from '@radix-ui/react-dialog';
import type { UseQueryResult } from '@tanstack/react-query';
import {
  AlertCircle, BedSingle, CalendarClock, CheckCircle2, ChevronRight, CircleDashed, Clock, Inbox, Loader2, LogOut, RotateCcw,
  User, Wrench, X, XCircle, type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type Ref, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { api } from '../lib/api';
import { formatINR } from '../lib/format';

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-hover dark:text-slate-950',
  secondary: 'border border-border bg-surface text-text hover:bg-surface-muted',
  ghost: 'text-text hover:bg-surface-muted',
  danger: 'bg-danger-text text-white hover:opacity-90 dark:text-slate-950',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  block?: boolean;
}

export function Button({ variant = 'primary', loading, block, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cx(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

const fieldClass =
  'min-h-11 w-full rounded-sm border border-border bg-surface px-3 text-sm text-text placeholder:text-text-muted disabled:bg-surface-muted';

export const Input = ({ className, ref, ...rest }: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) => <input ref={ref} className={cx(fieldClass, className)} {...rest} />;

export const Select = ({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) => <select className={cx(fieldClass, className)} {...rest} />;

export const Textarea = ({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea rows={4} className={cx(fieldClass, 'py-2', className)} {...rest} />;

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-text-muted">{label}</span>
      {children}
      {hint && !error && <span className="block break-all text-xs text-text-muted">{hint}</span>}
      {error && (
        <span role="alert" className="flex items-center gap-1 text-xs text-danger-text">
          <AlertCircle className="size-3" aria-hidden /> {error}
        </span>
      )}
    </label>
  );
}

export function FormError({ error }: { error?: Error | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-sm bg-surface-muted p-3 text-sm text-danger-text">
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {error.message}
    </p>
  );
}

export const Card = ({ className, children }: { className?: string; children: ReactNode }) => (
  <section className={cx('min-w-0 rounded-md border border-border bg-surface p-4 shadow-card md:p-5 lg:p-6', className)}>{children}</section>
);

export const CardTitle = ({ children, action }: { children: ReactNode; action?: ReactNode }) => (
  <div className="mb-3 flex items-center justify-between gap-2">
    <h2 className="text-base font-semibold">{children}</h2>
    {action}
  </div>
);

export const Skeleton = ({ className }: { className?: string }) => <div aria-hidden className={cx('animate-pulse rounded-md bg-surface-muted', className)} />;

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-2">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-14 w-full" />)}
    </div>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <Inbox className="size-10 text-text-muted" aria-hidden />
      <h3 className="text-base font-semibold">{title}</h3>
      {text && <p className="max-w-sm text-text-muted">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error?: Error | null; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <AlertCircle className="size-10 text-danger-text" aria-hidden />
      <p>{error?.message ?? t('Something went wrong')}</p>
      {onRetry && <Button variant="secondary" onClick={onRetry}><RotateCcw className="size-4" aria-hidden /> {t('Retry')}</Button>}
    </div>
  );
}

/** One place for the loading, error and data states every list must have. */
export function Query<T>({ query, children, skeleton }: { query: UseQueryResult<T, Error>; children: (data: T) => ReactNode; skeleton?: ReactNode }) {
  if (query.isPending) return <>{skeleton ?? <ListSkeleton />}</>;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  return <>{children(query.data)}</>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="mb-4 flex flex-wrap items-start justify-between gap-3 md:mb-6">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="text-text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export const Money = ({ paise, className }: { paise: number; className?: string }) => (
  <span className={cx('tabular', paise < 0 && 'text-danger-text', className)}>{formatINR(paise)}</span>
);

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONES: Record<Tone, string> = {
  success: 'text-success-text',
  warning: 'text-warning-text',
  danger: 'text-danger-text',
  info: 'text-info-text',
  neutral: 'text-neutral-text',
};

const STATUS: Record<string, [Tone, LucideIcon, string]> = {
  'bed.vacant': ['neutral', BedSingle, 'Vacant'],
  'bed.reserved': ['info', CalendarClock, 'Reserved'],
  'bed.occupied': ['success', User, 'Occupied'],
  'bed.notice': ['warning', LogOut, 'On notice'],
  'bed.maintenance': ['danger', Wrench, 'Maintenance'],
  'invoice.draft': ['neutral', CircleDashed, 'Draft'],
  'invoice.due': ['warning', Clock, 'Due'],
  'invoice.partially_paid': ['warning', Clock, 'Part paid'],
  'invoice.paid': ['success', CheckCircle2, 'Paid'],
  'invoice.overdue': ['danger', AlertCircle, 'Overdue'],
  'invoice.void': ['neutral', XCircle, 'Void'],
  'ticket.open': ['danger', AlertCircle, 'Open'],
  'ticket.in_progress': ['warning', Clock, 'In progress'],
  'ticket.resolved': ['success', CheckCircle2, 'Resolved'],
  'ticket.closed': ['neutral', CheckCircle2, 'Closed'],
  'ticket.rejected': ['neutral', XCircle, 'Rejected'],
  'stay.booked': ['info', CalendarClock, 'Booked'],
  'stay.active': ['success', CheckCircle2, 'Active'],
  'stay.notice': ['warning', LogOut, 'On notice'],
  'stay.checked_out': ['neutral', LogOut, 'Checked out'],
  'stay.cancelled': ['neutral', XCircle, 'Cancelled'],
  'kyc.pending': ['warning', Clock, 'KYC pending'],
  'kyc.submitted': ['info', Clock, 'KYC submitted'],
  'kyc.verified': ['success', CheckCircle2, 'KYC verified'],
  'kyc.rejected': ['danger', XCircle, 'KYC rejected'],
  'kyc.not_submitted': ['neutral', CircleDashed, 'Not submitted'],
  'kyc.pending_review': ['warning', Clock, 'Pending review'],
  'kyc.approved': ['success', CheckCircle2, 'Approved'],
  'org.pending': ['warning', Clock, 'Waiting for approval'],
  'org.trial': ['info', Clock, 'Trial'],
  'org.active': ['success', CheckCircle2, 'Active'],
  'org.read_only': ['warning', Clock, 'Read only'],
  'org.suspended': ['danger', XCircle, 'Suspended'],
  'org.cancelled': ['neutral', XCircle, 'Cancelled'],
};

/** Status is always icon plus text, never colour alone. */
export function StatusBadge({ kind, status }: { kind: string; status: string }) {
  const { t } = useTranslation();
  const [tone, Icon, label] = STATUS[`${kind}.${status}`] ?? ['neutral', CircleDashed, status];
  return (
    <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-sm bg-surface-muted px-2 py-0.5 text-xs font-medium', TONES[tone])}>
      <Icon className="size-3" aria-hidden /> {t(label)}
    </span>
  );
}

export function StatCard({ icon: Icon, label, value, hint, to }: { icon: LucideIcon; label: string; value: ReactNode; hint?: ReactNode; to?: string }) {
  const body = (
    <>
      <div className="flex items-center gap-2 text-text-muted">
        <Icon className="size-4" aria-hidden />
        <span className="truncate text-xs font-medium">{label}</span>
      </div>
      <p className="tabular mt-2 text-lg font-bold leading-7 sm:text-[22px] sm:leading-8 md:text-[28px] md:leading-9">{value}</p>
      {hint && <p className="mt-1 truncate text-xs text-text-muted">{hint}</p>}
    </>
  );
  const shell = 'block min-w-0 rounded-md border border-border bg-surface p-4 shadow-card';
  return to ? <Link to={to} className={cx(shell, 'hover:border-primary')}>{body}</Link> : <div className={shell}>{body}</div>;
}

/** Bottom sheet on phones, side drawer from md up. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/50" />
        <Dialog.Content
          aria-describedby={undefined}
          className="safe-bottom fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] overflow-y-auto rounded-t-xl bg-surface p-4 shadow-overlay md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[480px] md:rounded-none md:p-6"
        >
          <div className="mb-4 flex items-center justify-between gap-2">
            <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" aria-label={t('Close')} className="px-2"><X className="size-5" aria-hidden /></Button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Confirm({ open, onClose, onConfirm, title, text, action, loading, error }: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: string; text: string; action: string; loading?: boolean; error?: Error | null;
}) {
  const { t } = useTranslation();
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <p className="mb-4 text-text-muted">{text}</p>
      <FormError error={error} />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="danger" loading={loading} onClick={onConfirm}>{action}</Button>
      </div>
    </Sheet>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string }[] }) {
  return (
    <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          role="tab"
          aria-selected={value === tab.value}
          onClick={() => onChange(tab.value)}
          className={cx(
            'min-h-11 shrink-0 border-b-2 px-3 text-sm font-medium',
            value === tab.value ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  align?: 'right';
}

/** Table from md up, card list on phones. */
export function DataList<T>({ rows, columns, rowKey, onRow, mobile }: {
  rows: T[]; columns: Column<T>[]; rowKey: (row: T) => string; onRow?: (row: T) => void; mobile: (row: T) => ReactNode;
}) {
  return (
    <>
      <ul className="space-y-2 md:hidden">
        {rows.map((row) => (
          <li key={rowKey(row)}>
            <button
              type="button"
              disabled={!onRow}
              onClick={() => onRow?.(row)}
              className="flex min-h-11 w-full items-center gap-2 rounded-md border border-border bg-surface p-3 text-left"
            >
              <div className="min-w-0 flex-1">{mobile(row)}</div>
              {onRow && <ChevronRight className="size-4 shrink-0 text-text-muted" aria-hidden />}
            </button>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-md border border-border bg-surface md:block">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-surface-muted text-xs text-text-muted">
            <tr>
              {columns.map((c) => <th key={c.header} scope="col" className={cx('px-4 py-3 font-medium', c.align === 'right' && 'text-right')}>{c.header}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} onClick={() => onRow?.(row)} className={cx('border-t border-border', onRow && 'cursor-pointer hover:bg-primary-soft')}>
                {columns.map((c) => <td key={c.header} className={cx('px-4 py-3', c.align === 'right' && 'tabular text-right')}>{c.cell(row)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  const { t } = useTranslation();
  if (totalPages <= 1) return null;
  return (
    <nav aria-label={t('Pagination')} className="mt-4 flex items-center justify-between gap-2">
      <Button variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>{t('Previous')}</Button>
      <span className="tabular text-text-muted">{page} / {totalPages}</span>
      <Button variant="secondary" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>{t('Next')}</Button>
    </nav>
  );
}

/** Uploads through the API, then reports the storage key. */
export function FileUpload({ label, kind, orgId, value, onChange }: { label: string; kind: string; orgId: string; value?: string; onChange: (key: string) => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  return (
    <Field label={label} error={error?.message}>
      <input
        type="file"
        accept="image/*,application/pdf"
        capture={undefined}
        className={cx(fieldClass, 'py-2')}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBusy(true);
          setError(null);
          try {
            onChange((await api.upload(file, kind, orgId)).key);
          } catch (err) {
            setError(err as Error);
          } finally {
            setBusy(false);
          }
        }}
      />
      {busy && <span className="text-xs text-text-muted">{t('Uploading…')}</span>}
      {value && !busy && <span className="flex items-center gap-1 text-xs text-success-text"><CheckCircle2 className="size-3" aria-hidden /> {t('Uploaded')}</span>}
    </Field>
  );
}

/** Loads a protected file with the bearer token, then shows it. */
export function SecureImage({ fileKey, alt }: { fileKey: string; alt: string }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let created: string | undefined;
    void api.blob(`/files/${fileKey}`).then((blob) => {
      created = URL.createObjectURL(blob);
      setUrl(created);
    }).catch(() => undefined);
    return () => {
      if (created) URL.revokeObjectURL(created);
    };
  }, [fileKey]);
  return url ? <img src={url} alt={alt} className="max-h-72 rounded-md border border-border" /> : <Skeleton className="h-40 w-full" />;
}
