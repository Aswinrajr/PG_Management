import { AppError } from '../../lib/errors.js';
import { Organization, Plan } from './model.js';

const UNLIMITED = 1_000_000;

export const DEFAULT_PLANS = [
  { code: 'trial', name: 'Trial', priceMonthlyPaise: 0, priceYearlyPaise: 0, limits: { properties: 5, beds: 100 }, features: [], isPublic: false, sortOrder: 0 },
  { code: 'starter', name: 'Starter', priceMonthlyPaise: 49900, priceYearlyPaise: 499000, limits: { properties: 1, beds: 50 }, features: [], sortOrder: 1 },
  { code: 'growth', name: 'Growth', priceMonthlyPaise: 149900, priceYearlyPaise: 1499000, limits: { properties: 5, beds: 300 }, features: ['gst', 'reports'], sortOrder: 2 },
  { code: 'pro', name: 'Pro', priceMonthlyPaise: 399900, priceYearlyPaise: 3999000, limits: { properties: UNLIMITED, beds: 1000 }, features: ['gst', 'reports', 'planner3d', 'whatsapp'], sortOrder: 3 },
];

/** D13: safe to run on every start. */
export async function ensurePlans() {
  await Plan.bulkWrite(
    DEFAULT_PLANS.map((plan) => ({ updateOne: { filter: { code: plan.code }, update: { $setOnInsert: plan }, upsert: true } })),
  );
}

export type LimitKey = 'properties' | 'beds';

export async function assertPlanLimit(orgId: string, key: LimitKey, current: number, adding: number) {
  const org = await Organization.findById(orgId).lean();
  const plan = org && (await Plan.findById(org.planId).lean());
  const limit = plan?.limits?.[key];
  if (limit == null) throw new AppError('INTERNAL', 'Organization has no plan', 500);
  if (current + adding > limit) {
    throw new AppError('PLAN_LIMIT', `Your ${plan!.name} plan allows ${limit} ${key}. Upgrade to add more.`, 402, { key, limit, current });
  }
}
