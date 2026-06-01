import { NextRequest, NextResponse } from 'next/server';
import { updateLastSeenAtByEmail } from '@/lib/users';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { email?: string };
    const email = typeof body.email === 'string' ? body.email : '';

    if (!email) {
      return NextResponse.json(
        { ok: false, error: 'Email is required' },
        { status: 400 },
      );
    }

    await updateLastSeenAtByEmail(email);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[last-seen] Error:', error);
    return NextResponse.json(
      { ok: false, error: 'Server error' },
      { status: 500 },
    );
  }
}
