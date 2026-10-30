export const daysInMonth = (year: number, month1to12: number): number =>
  new Date(Date.UTC(year, month1to12, 0)).getUTCDate();

/** Pro-rata per docs/11-DECISIONS.md D10: inclusive of the join day, nearest paisa. */
export function proRatePaise(monthlyPaise: number, joinDay: number, totalDays: number): number {
  if (!Number.isInteger(monthlyPaise) || monthlyPaise < 0) throw new RangeError('monthlyPaise must be a non-negative integer');
  if (joinDay < 1 || joinDay > totalDays) throw new RangeError('joinDay out of range');
  return Math.round((monthlyPaise * (totalDays - joinDay + 1)) / totalDays);
}

/** Allocates a payment across open invoices, oldest first. */
export function allocateOldestFirst<T extends { id: string; balancePaise: number }>(
  invoices: readonly T[],
  amountPaise: number,
): { allocations: { invoiceId: string; amountPaise: number }[]; unallocatedPaise: number } {
  let left = amountPaise;
  const allocations: { invoiceId: string; amountPaise: number }[] = [];
  for (const inv of invoices) {
    if (left <= 0) break;
    const take = Math.min(left, inv.balancePaise);
    if (take > 0) {
      allocations.push({ invoiceId: inv.id, amountPaise: take });
      left -= take;
    }
  }
  return { allocations, unallocatedPaise: left };
}

/** Positive refundPaise = pay the resident; negative = resident still owes. */
export function settlementPaise(input: {
  depositPaidPaise: number;
  duesPaise: number;
  deductions: { amountPaise: number }[];
}): { deductionsPaise: number; refundPaise: number } {
  const deductionsPaise = input.deductions.reduce((sum, d) => sum + d.amountPaise, 0);
  return { deductionsPaise, refundPaise: input.depositPaidPaise - input.duesPaise - deductionsPaise };
}

export function formatINR(paise: number): string {
  const rupees = paise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: Number.isInteger(rupees) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(rupees);
}
