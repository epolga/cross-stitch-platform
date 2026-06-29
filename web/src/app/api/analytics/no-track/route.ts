import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const TEN_YEARS = 60 * 60 * 24 * 365 * 10;

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  if (!adminEmails.includes(session.email.toLowerCase())) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const clear = req.nextUrl.searchParams.get('clear') === '1';
  const res = NextResponse.json({ ok: true, noTrack: !clear });

  if (clear) {
    res.cookies.set('no_track', '', { maxAge: 0, path: '/' });
  } else {
    res.cookies.set('no_track', '1', { maxAge: TEN_YEARS, path: '/', httpOnly: false, sameSite: 'lax' });
  }

  return res;
}
