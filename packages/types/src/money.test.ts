import { describe, expect, it } from 'vitest';
import { allocateOldestFirst, daysInMonth, formatINR, proRatePaise, settlementPaise } from './money.js';

describe('proRatePaise', () => {
  it('counts the join day (D10)', () => expect(proRatePaise(850000, 15, 30)).toBe(453333));
  it('charges a full month from the 1st', () => expect(proRatePaise(850000, 1, 30)).toBe(850000));
  it('charges one day on the last day', () => expect(proRatePaise(900000, 30, 30)).toBe(30000));
  it('rejects a day outside the month', () => expect(() => proRatePaise(100, 31, 30)).toThrow(RangeError));
  it('handles leap February', () => expect(daysInMonth(2028, 2)).toBe(29));
});

describe('allocateOldestFirst', () => {
  const invoices = [
    { id: 'a', balancePaise: 500 },
    { id: 'b', balancePaise: 300 },
  ];
  it('spans two invoices', () =>
    expect(allocateOldestFirst(invoices, 600).allocations).toEqual([
      { invoiceId: 'a', amountPaise: 500 },
      { invoiceId: 'b', amountPaise: 100 },
    ]));
  it('reports overpayment', () => expect(allocateOldestFirst(invoices, 900).unallocatedPaise).toBe(100));
});

describe('settlementPaise', () => {
  it('refunds what is left', () =>
    expect(settlementPaise({ depositPaidPaise: 1000, duesPaise: 300, deductions: [{ amountPaise: 200 }] }).refundPaise).toBe(500));
  it('goes negative when the resident owes', () =>
    expect(settlementPaise({ depositPaidPaise: 100, duesPaise: 300, deductions: [] }).refundPaise).toBe(-200));
});

describe('formatINR', () => {
  it('uses Indian grouping', () => expect(formatINR(12500000)).toBe('₹1,25,000'));
  it('shows paise only when needed', () => expect(formatINR(453333)).toBe('₹4,533.33'));
});
