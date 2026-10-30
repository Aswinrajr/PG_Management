const IST_OFFSET_MS = 5.5 * 3600_000;

/** Calendar parts of an instant as seen in Asia/Kolkata. */
export function istParts(date: Date) {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

/** The instant of IST midnight on a calendar date. */
export const istDate = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day) - IST_OFFSET_MS);

export const periodOf = (date: Date) => {
  const { year, month } = istParts(date);
  return `${year}-${String(month).padStart(2, '0')}`;
};

export const parsePeriod = (period: string) => {
  const [year, month] = period.split('-').map(Number) as [number, number];
  return { year, month };
};

export const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86400_000);
