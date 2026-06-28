import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ isAdmin: false });

  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);

  return NextResponse.json({ isAdmin: adminEmails.includes(session.email.toLowerCase()) });
}
