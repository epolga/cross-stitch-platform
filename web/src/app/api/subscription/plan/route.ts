import { NextResponse } from 'next/server';

const DEFAULT_MONTHLY_PLAN_ID = 'P-4JN53753JF067172ANGILEGY';
const DEFAULT_YEARLY_PLAN_ID = 'P-4R88162396385170BNGILF7Y';

type PlanResponse = {
  monthlyPlanId: string;
  yearlyPlanId: string;
};

export async function POST(): Promise<NextResponse> {
  const monthlyPlanId =
    process.env.PAYPAL_MONTHLY_PLAN_ID ||
    process.env.NEXT_PUBLIC_PAYPAL_MONTHLY_PLAN_ID ||
    DEFAULT_MONTHLY_PLAN_ID;
  const yearlyPlanId =
    process.env.PAYPAL_YEARLY_PLAN_ID ||
    process.env.NEXT_PUBLIC_PAYPAL_YEARLY_PLAN_ID ||
    DEFAULT_YEARLY_PLAN_ID;

  if (!monthlyPlanId || !yearlyPlanId) {
    return NextResponse.json(
      {
        error:
          'Missing plan ids. Set PAYPAL_MONTHLY_PLAN_ID and PAYPAL_YEARLY_PLAN_ID in environment.',
      },
      { status: 500 },
    );
  }

  const response: PlanResponse = {
    monthlyPlanId,
    yearlyPlanId,
  };

  return NextResponse.json(response, { status: 200 });
}
