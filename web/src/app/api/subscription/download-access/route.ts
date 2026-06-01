import { NextResponse } from 'next/server';
import {
  consumeTrialDownloadByEmail,
  getDownloadAccessByEmail,
} from '@/lib/users';

interface DownloadAccessRequestBody {
  email?: string;
  designId?: number;
  consume?: boolean;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json().catch(() => null)) as
      | DownloadAccessRequestBody
      | null;
    const normalizedEmail = body?.email?.trim().toLowerCase() ?? '';

    if (!normalizedEmail) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const shouldConsume = body?.consume === true;
    if (!shouldConsume) {
      const access = await getDownloadAccessByEmail(normalizedEmail);
      return NextResponse.json(access);
    }

    const designId = Number(body?.designId);
    if (!Number.isInteger(designId) || designId <= 0) {
      return NextResponse.json({ error: 'Valid designId is required' }, { status: 400 });
    }

    const access = await consumeTrialDownloadByEmail(normalizedEmail, designId);
    return NextResponse.json(access);
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unable to check paid download access';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
