import { NextResponse } from 'next/server';
import {
  getTrialDownloadLimit,
  getTrialDurationDays,
  startTrialForEmail,
} from '@/lib/users';

interface StartTrialRequestBody {
  email?: string;
  password?: string;
  firstName?: string;
  username?: string;
  receiveUpdates?: boolean;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json().catch(() => null)) as
      | StartTrialRequestBody
      | null;

    const normalizedEmail = body?.email?.trim().toLowerCase() ?? '';
    if (!normalizedEmail) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const result = await startTrialForEmail({
      email: normalizedEmail,
      password: body?.password,
      firstName:
        body?.firstName?.trim() ||
        normalizedEmail.split('@')[0] ||
        'User',
      username: body?.username?.trim() || normalizedEmail.split('@')[0] || 'user',
      receiveUpdates: body?.receiveUpdates,
      trialDownloadLimit: getTrialDownloadLimit(),
      trialDurationDays: getTrialDurationDays(),
    });

    if (result.outcome === 'MISSING_REGISTRATION_FIELDS') {
      return NextResponse.json(
        {
          error:
            'Password and first name are required to start trial for a new account.',
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        outcome: result.outcome,
        trial: result.entitlement?.trial ?? null,
        subscription: result.entitlement?.subscription ?? null,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Unable to start trial';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
