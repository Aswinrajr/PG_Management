export { formatINR } from '@roomora/types';

const TZ = 'Asia/Kolkata';

export const formatDate = (value?: string | Date | null) =>
  value ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ }) : '—';

export const formatPeriod = (period: string) => {
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: TZ });
};

export const todayInput = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

export const currentPeriod = () => todayInput().slice(0, 7);

export const rupeesToPaise = (value: string | number) => Math.round(Number(value) * 100);

export const paiseToRupees = (paise?: number | null) => (paise ?? 0) / 100;

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

export const displayPhone = (phone?: string) => (phone ? `+91 ${phone.replace(/^91/, '')}` : '');

/** Monday of the current IST week, as YYYY-MM-DD. */
export const weekStartOf = (shiftWeeks = 0) => {
  const date = new Date(`${todayInput()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7) + shiftWeeks * 7);
  return date.toISOString().slice(0, 10);
};
