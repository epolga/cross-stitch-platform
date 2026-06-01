import { NextResponse } from 'next/server';
import {
  getTrialDownloadLimit,
  getTrialDurationDays,
  getUserEntitlementStatusByEmail,
} from '@/lib/users';

interface StatusRequestBody {
  email?: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json().catch(() => null)) as StatusRequestBody | null;
    const normalizedEmail = body?.email?.trim().toLowerCase() ?? '';

    if (!normalizedEmail) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const entitlement = await getUserEntitlementStatusByEmail(normalizedEmail);
    if (!entitlement) {
      return NextResponse.json({
        active: false,
        status: 'NONE',
        canDownload: false,
        subscription: {
          id: null,
          active: false,
        },
        trial: {
          status: 'NOT_STARTED',
          available: true,
          downloadLimit: getTrialDownloadLimit(),
          downloadsUsed: 0,
          downloadsRemaining: getTrialDownloadLimit(),
          durationDays: getTrialDurationDays(),
        },
      });
    }

    if (!entitlement.subscription.subscriptionId) {
      return NextResponse.json({
        active: false,
        status: 'NONE',
        canDownload: entitlement.trial.status === 'ACTIVE',
        subscription: {
          id: null,
          active: false,
        },
        trial: {
          ...entitlement.trial,
          durationDays: getTrialDurationDays(),
        },
      });
    }

    if (!entitlement.subscription.subscriptionActive) {
      return NextResponse.json({
        active: false,
        status: 'INACTIVE_RECORDED',
        subscriptionId: entitlement.subscription.subscriptionId,
        canDownload: entitlement.trial.status === 'ACTIVE',
        subscription: {
          id: entitlement.subscription.subscriptionId,
          active: false,
          startedAt: entitlement.subscription.subscriptionStartedAt,
        },
        trial: {
          ...entitlement.trial,
          durationDays: getTrialDurationDays(),
        },
      });
    }

    return NextResponse.json({
      active: true,
      status: 'ACTIVE_RECORDED',
      subscriptionId: entitlement.subscription.subscriptionId,
      subscriptionStartedAt: entitlement.subscription.subscriptionStartedAt,
      canDownload: true,
      subscription: {
        id: entitlement.subscription.subscriptionId,
        active: true,
        startedAt: entitlement.subscription.subscriptionStartedAt,
      },
      trial: {
        ...entitlement.trial,
        durationDays: getTrialDurationDays(),
      },
    });
  } catch (error: unknown) {
    console.error('[subscription/status] Failed to check subscription:', error);
    const message =
      error instanceof Error
        ? error.message
        : 'Unable to check subscription status';

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
