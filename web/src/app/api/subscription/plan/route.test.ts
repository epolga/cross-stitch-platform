import { afterEach, describe, expect, it } from 'vitest';
import { POST } from './route';

const originalMonthly = process.env.PAYPAL_MONTHLY_PLAN_ID;
const originalYearly = process.env.PAYPAL_YEARLY_PLAN_ID;
const originalPublicMonthly = process.env.NEXT_PUBLIC_PAYPAL_MONTHLY_PLAN_ID;
const originalPublicYearly = process.env.NEXT_PUBLIC_PAYPAL_YEARLY_PLAN_ID;

afterEach(() => {
  if (originalMonthly === undefined) {
    delete process.env.PAYPAL_MONTHLY_PLAN_ID;
  } else {
    process.env.PAYPAL_MONTHLY_PLAN_ID = originalMonthly;
  }

  if (originalYearly === undefined) {
    delete process.env.PAYPAL_YEARLY_PLAN_ID;
  } else {
    process.env.PAYPAL_YEARLY_PLAN_ID = originalYearly;
  }

  if (originalPublicMonthly === undefined) {
    delete process.env.NEXT_PUBLIC_PAYPAL_MONTHLY_PLAN_ID;
  } else {
    process.env.NEXT_PUBLIC_PAYPAL_MONTHLY_PLAN_ID = originalPublicMonthly;
  }

  if (originalPublicYearly === undefined) {
    delete process.env.NEXT_PUBLIC_PAYPAL_YEARLY_PLAN_ID;
  } else {
    process.env.NEXT_PUBLIC_PAYPAL_YEARLY_PLAN_ID = originalPublicYearly;
  }
});

describe('POST /api/subscription/plan', () => {
  it('returns explicit env plan ids when present', async () => {
    process.env.PAYPAL_MONTHLY_PLAN_ID = 'P-MONTHLY-ENV';
    process.env.PAYPAL_YEARLY_PLAN_ID = 'P-YEARLY-ENV';

    const response = await POST();
    const payload = (await response.json()) as {
      monthlyPlanId: string;
      yearlyPlanId: string;
    };

    expect(response.status).toBe(200);
    expect(payload.monthlyPlanId).toBe('P-MONTHLY-ENV');
    expect(payload.yearlyPlanId).toBe('P-YEARLY-ENV');
  });

  it('falls back to default hardcoded plan ids', async () => {
    delete process.env.PAYPAL_MONTHLY_PLAN_ID;
    delete process.env.PAYPAL_YEARLY_PLAN_ID;
    delete process.env.NEXT_PUBLIC_PAYPAL_MONTHLY_PLAN_ID;
    delete process.env.NEXT_PUBLIC_PAYPAL_YEARLY_PLAN_ID;

    const response = await POST();
    const payload = (await response.json()) as {
      monthlyPlanId: string;
      yearlyPlanId: string;
    };

    expect(response.status).toBe(200);
    expect(payload.monthlyPlanId).toBe('P-4JN53753JF067172ANGILEGY');
    expect(payload.yearlyPlanId).toBe('P-4R88162396385170BNGILF7Y');
  });
});
